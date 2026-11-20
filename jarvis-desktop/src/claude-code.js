// Run Jarvis on the user's own Claude account through the Claude Code CLI (no API key).
//
// One long-lived `claude -p` process in stream-json mode holds the conversation.
// Jarvis's own tools (screen, PowerShell, clipboard, timers…) are handed to it through a
// tiny MCP server on 127.0.0.1 that lives inside this Electron process. Web search/fetch
// use Claude Code's built-in tools. Every other built-in tool is switched off, so anything
// that touches the PC goes through Jarvis (and its approval prompt).

import http from "node:http";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn, execFile } from "node:child_process";
import { randomBytes } from "node:crypto";

const IS_WIN = process.platform === "win32";

// ------------------------------------------------------------------ find the CLI
export async function findClaude() {
  const candidates = IS_WIN
    ? [path.join(os.homedir(), ".local", "bin", "claude.exe"), path.join(process.env.APPDATA || "", "npm", "claude.cmd")]
    : [path.join(os.homedir(), ".local", "bin", "claude"), "/usr/local/bin/claude", "/opt/homebrew/bin/claude"];
  for (const c of candidates) if (c && existsSync(c)) return c;
  const found = await new Promise((resolve) =>
    execFile(IS_WIN ? "where.exe" : "which", ["claude"], { windowsHide: true }, (err, out) =>
      resolve(err ? "" : out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || "")));
  if (!found) return "";
  if (IS_WIN && !/\.(exe|cmd|bat)$/i.test(found) && existsSync(found + ".cmd")) return found + ".cmd";
  return found;
}

// Opens a visible terminal that installs Claude Code if needed and starts it so the user can sign in.
// Is the CLI signed in? (`claude auth status` prints JSON with loggedIn.)
export function claudeAuthStatus(bin) {
  return new Promise((resolve) => {
    const cmd = /\.(cmd|bat)$/i.test(bin) ? ["cmd.exe", ["/d", "/s", "/c", `"${bin}" auth status --json`]] : [bin, ["auth", "status", "--json"]];
    const env = { ...process.env }; delete env.ANTHROPIC_API_KEY;
    execFile(cmd[0], cmd[1], { windowsHide: true, timeout: 20000, env }, (err, out) => {
      try { resolve(!!JSON.parse(out).loggedIn); } catch { resolve(false); }
    });
  });
}

// Opens a visible terminal that installs Claude Code if needed and starts the sign-in.
export function openSignInTerminal(claudePath) {
  if (IS_WIN) {
    const exe = claudePath ? `'${claudePath.replace(/'/g, "''")}'` : "(Join-Path $env:USERPROFILE '.local\\bin\\claude.exe')";
    const install = claudePath ? "" : "Write-Host 'Installing Claude Code…'; irm https://claude.ai/install.ps1 | iex; ";
    const script = `$Host.UI.RawUI.WindowTitle = 'Jarvis: sign in to Claude'; ${install}Write-Host ''; Write-Host 'A browser window will open. Sign in with your Claude account.' -ForegroundColor Cyan; & ${exe} auth login; Write-Host ''; Write-Host 'Done. You can close this window and go back to Jarvis.' -ForegroundColor Green`;
    spawn("powershell.exe", ["-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], { detached: true, stdio: "ignore" }).unref();
  } else {
    const cmd = (claudePath || "curl -fsSL https://claude.ai/install.sh | bash && ~/.local/bin/claude") + " auth login";
    const term = process.platform === "darwin"
      ? ["osascript", ["-e", `tell application "Terminal" to do script "${cmd.replace(/"/g, '\\"')}"`]]
      : ["x-terminal-emulator", ["-e", `bash -lc '${cmd}; exec bash'`]];
    spawn(term[0], term[1], { detached: true, stdio: "ignore" }).unref();
  }
}

// ------------------------------------------------------------------ MCP server (Streamable HTTP, JSON responses)
function toMcpContent(out) {
  if (typeof out === "string") return [{ type: "text", text: out }];
  return out.map((b) => b.type === "image"
    ? { type: "image", data: b.source.data, mimeType: b.source.media_type }
    : { type: "text", text: b.text });
}

export async function startMcpServer({ tools, runTool }) {
  const token = randomBytes(16).toString("hex");
  const mcpTools = tools.filter((t) => t.input_schema).map((t) => ({
    name: t.name, description: t.description, inputSchema: t.input_schema,
  }));

  const server = http.createServer(async (req, res) => {
    if (req.url !== `/${token}/mcp`) { res.writeHead(404); return res.end(); }
    if (req.method !== "POST") { res.writeHead(405, { Allow: "POST" }); return res.end(); }
    let raw = ""; for await (const c of req) raw += c;
    let msg; try { msg = JSON.parse(raw); } catch { res.writeHead(400); return res.end(); }

    const reply = (result) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result })); };
    const fail = (code, message) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code, message } })); };

    if (msg.id === undefined) { res.writeHead(202); return res.end(); } // notifications
    switch (msg.method) {
      case "initialize":
        return reply({ protocolVersion: msg.params?.protocolVersion || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "jarvis", version: "1.0.0" } });
      case "ping": return reply({});
      case "tools/list": return reply({ tools: mcpTools });
      case "tools/call": {
        try {
          const out = await runTool(msg.params.name, msg.params.arguments || {});
          return reply({ content: toMcpContent(out) });
        } catch (e) {
          return reply({ content: [{ type: "text", text: `Error: ${e.message}` }], isError: true });
        }
      }
      default: return fail(-32601, `Method not found: ${msg.method}`);
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}/${token}/mcp`, close: () => server.close() };
}

// ------------------------------------------------------------------ the CLI session
const quote = (a) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a);

export class ClaudeCodeSession {
  constructor({ send, mcpUrl, systemPrompt, model, effort, userDir }) {
    Object.assign(this, { send, mcpUrl, systemPrompt, model, effort, userDir });
    this.proc = null; this.turn = null; this.buf = ""; this.stderr = "";
  }

  async start() {
    const bin = await findClaude();
    if (!bin) throw Object.assign(new Error("Claude Code isn't installed."), { code: "NO_CLAUDE" });
    const dir = path.resolve(this.userDir, "claude-code");
    await fs.mkdir(dir, { recursive: true });
    const mcpFile = path.join(dir, "mcp.json"), promptFile = path.join(dir, "jarvis-prompt.md");
    await fs.writeFile(mcpFile, JSON.stringify({ mcpServers: { jarvis: { type: "http", url: this.mcpUrl } } }));
    await fs.writeFile(promptFile, this.systemPrompt);

    const args = [
      "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
      "--model", this.model,
      ...(this.effort ? ["--effort", this.effort] : []),
      "--tools", "WebSearch,WebFetch",                  // built-ins: research only
      "--mcp-config", mcpFile, "--strict-mcp-config",   // Jarvis's tools
      "--allowedTools", "mcp__jarvis", "WebSearch", "WebFetch",
      "--permission-mode", "dontAsk",
      "--append-system-prompt-file", promptFile,
      "--no-session-persistence",
    ];
    const env = { ...process.env, MCP_TOOL_TIMEOUT: "900000" }; // approvals can take a while
    delete env.ANTHROPIC_API_KEY; // always use the signed-in Claude account

    this.proc = /\.(cmd|bat)$/i.test(bin)
      ? spawn("cmd.exe", ["/d", "/s", "/c", [quote(bin), ...args.map(quote)].join(" ")], { cwd: os.homedir(), env, windowsHide: true, windowsVerbatimArguments: true })
      : spawn(bin, args, { cwd: os.homedir(), env, windowsHide: true });

    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (d) => this.onData(d));
    this.proc.stderr.on("data", (d) => (this.stderr = (this.stderr + d).slice(-4000)));
    this.proc.on("exit", (code) => {
      const t = this.turn; this.proc = null; this.turn = null;
      if (t) {
        const why = /log ?in|auth|credential|not logged/i.test(this.stderr)
          ? Object.assign(new Error("Not signed in to Claude Code."), { code: "NO_LOGIN" })
          : new Error(`Claude Code stopped (exit ${code}). ${this.stderr.trim().split("\n").slice(-3).join(" ")}`);
        t.reject(why);
      }
    });
    this.proc.on("error", (e) => { const t = this.turn; this.turn = null; t?.reject(e); });
  }

  onData(chunk) {
    this.buf += chunk;
    let i;
    while ((i = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1);
      if (!line) continue;
      let ev; try { ev = JSON.parse(line); } catch { continue; }
      this.handle(ev);
    }
  }

  handle(ev) {
    if (ev.type === "stream_event") {
      const e = ev.event;
      if (e.type === "content_block_delta" && e.delta?.type === "text_delta") this.send("agent", { type: "text", text: e.delta.text });
      if (e.type === "content_block_start" && /tool_use$/.test(e.content_block?.type)) {
        const name = toolName(e.content_block.name);
        if (name !== "run_powershell") this.send("agent", { type: "tool", name, status: "running" }); // PowerShell announces itself after approval
      }
    } else if (ev.type === "user" && Array.isArray(ev.message?.content)) {
      for (const b of ev.message.content) if (b.type === "tool_result" && this.pendingTools?.[b.tool_use_id])
        this.send("agent", { type: "tool", name: this.pendingTools[b.tool_use_id], status: b.is_error ? "error" : "done" });
    } else if (ev.type === "system" && ev.subtype === "init") {
      this.sessionId = ev.session_id;              // lets Jarvis ignore its own hook events
    } else if (ev.type === "assistant" && Array.isArray(ev.message?.content)) {
      for (const b of ev.message.content) if (b.type === "tool_use" || b.type === "server_tool_use") {
        (this.pendingTools ||= {})[b.id] = toolName(b.name);
        this.send("agent", { type: "tool", name: toolName(b.name), status: "detail", input: b.input || {} });   // full input: "Opening Spotify", the search query…
      }
    } else if (ev.type === "result") {
      const t = this.turn; this.turn = null;
      if (!t) return;
      if (ev.is_error || ev.subtype !== "success") {
        const text = String(ev.result || ev.errors?.join(" ") || ev.subtype || "");
        const err = new Error(text || "Claude Code reported an error.");
        if (/log ?in|auth|credential/i.test(text)) err.code = "NO_LOGIN";
        if (/limit|usage|quota/i.test(text)) err.code = "LIMIT";
        t.reject(err);
      } else t.resolve();
    }
  }

  async ask(content) {
    if (!this.proc) await this.start();
    if (this.turn) throw new Error("Still working on the previous request.");
    this.pendingTools = {};
    const done = new Promise((resolve, reject) => (this.turn = { resolve, reject }));
    this.proc.stdin.write(JSON.stringify({ type: "user", message: { role: "user", content } }) + "\n");
    return done;
  }

  interrupt() {
    if (!this.proc || !this.turn) return;
    this.proc.stdin.write(JSON.stringify({ type: "control_request", request_id: randomBytes(6).toString("hex"), request: { subtype: "interrupt" } }) + "\n");
    // If it doesn't stop promptly, end the process (the conversation restarts on the next message).
    const t = this.turn;
    setTimeout(() => { if (this.turn === t) this.kill(); }, 3000);
  }

  kill() { try { this.proc?.kill(); } catch {} this.proc = null; }
}

// Claude Code names MCP tools mcp__<server>__<tool> and its own web tools WebSearch/WebFetch.
function toolName(n) {
  if (n === "WebSearch") return "web_search";
  if (n === "WebFetch") return "web_fetch";
  return n.replace(/^mcp__jarvis__/, "");
}
