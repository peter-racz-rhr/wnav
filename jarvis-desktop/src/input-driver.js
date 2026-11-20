// Mouse and keyboard control for Windows.
// One long-lived PowerShell process compiles a small user32 wrapper once, then executes
// one command per line from stdin and answers "OK" or "ERR <message>". This keeps each
// action fast (no PowerShell start-up per click).

import { spawn } from "node:child_process";

const IS_WIN = process.platform === "win32";

const CSHARP = String.raw`
using System;
using System.Runtime.InteropServices;
using System.Threading;

public static class JIn {
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr extra; }
  [StructLayout(LayoutKind.Explicit)] public struct UNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public UNION u; }

  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extra);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);

  public static void Init() { SetProcessDPIAware(); }

  public static void Move(int x, int y) { SetCursorPos(x, y); }

  public static void Click(int x, int y, int button, int count) {
    uint down = 0x0002, up = 0x0004;                 // left
    if (button == 1) { down = 0x0008; up = 0x0010; } // right
    if (button == 2) { down = 0x0020; up = 0x0040; } // middle
    SetCursorPos(x, y); Thread.Sleep(40);
    for (int i = 0; i < count; i++) {
      mouse_event(down, 0, 0, 0, UIntPtr.Zero); Thread.Sleep(30);
      mouse_event(up, 0, 0, 0, UIntPtr.Zero); Thread.Sleep(70);
    }
  }

  public static void Drag(int x1, int y1, int x2, int y2) {
    SetCursorPos(x1, y1); Thread.Sleep(40);
    mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero);
    for (int i = 1; i <= 20; i++) { SetCursorPos(x1 + (x2 - x1) * i / 20, y1 + (y2 - y1) * i / 20); Thread.Sleep(12); }
    mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
  }

  public static void Scroll(int x, int y, int notches) {
    SetCursorPos(x, y); Thread.Sleep(30);
    mouse_event(0x0800, 0, 0, notches * 120, UIntPtr.Zero);
  }

  public static void Type(string s) {
    int size = Marshal.SizeOf(typeof(INPUT));
    foreach (char c in s) {
      if (c == '\r') continue;
      if (c == '\n') { Key(new int[0], 0x0D); continue; }
      INPUT[] inp = new INPUT[2];
      inp[0].type = 1; inp[0].u.ki.wScan = c; inp[0].u.ki.dwFlags = 0x0004;          // KEYEVENTF_UNICODE
      inp[1].type = 1; inp[1].u.ki.wScan = c; inp[1].u.ki.dwFlags = 0x0004 | 0x0002; // + KEYUP
      SendInput(2, inp, size);
      Thread.Sleep(6);
    }
  }

  public static void Key(int[] mods, int vk) {
    foreach (int m in mods) keybd_event((byte)m, 0, 0, UIntPtr.Zero);
    uint ext = IsExtended(vk) ? 0x0001u : 0u;
    keybd_event((byte)vk, 0, ext, UIntPtr.Zero); Thread.Sleep(20);
    keybd_event((byte)vk, 0, ext | 0x0002, UIntPtr.Zero);
    for (int i = mods.Length - 1; i >= 0; i--) keybd_event((byte)mods[i], 0, 0x0002, UIntPtr.Zero);
  }

  static bool IsExtended(int vk) { return (vk >= 0x21 && vk <= 0x28) || vk == 0x2D || vk == 0x2E || vk == 0x5B; }
}
`;

const LOOP = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [Console]::InputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
${CSHARP}
'@
[JIn]::Init()
[Console]::Out.WriteLine('READY'); [Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  try { Invoke-Expression $line | Out-Null; [Console]::Out.WriteLine('OK') }
  catch { [Console]::Out.WriteLine('ERR ' + $_.Exception.Message) }
  [Console]::Out.Flush()
}
`;

const VK = {
  enter: 0x0D, return: 0x0D, tab: 0x09, esc: 0x1B, escape: 0x1B, space: 0x20, backspace: 0x08, delete: 0x2E, del: 0x2E,
  insert: 0x2D, home: 0x24, end: 0x23, pageup: 0x21, pagedown: 0x22, up: 0x26, down: 0x28, left: 0x25, right: 0x27,
  printscreen: 0x2C, capslock: 0x14, menu: 0x5D,
};
for (let i = 1; i <= 12; i++) VK["f" + i] = 0x6F + i;
const MOD = { ctrl: 0x11, control: 0x11, shift: 0x10, alt: 0x12, win: 0x5B, windows: 0x5B, cmd: 0x5B, meta: 0x5B };

// "ctrl+shift+t" -> "[JIn]::Key(@(17,16), 84)"
export function keyCommand(combo) {
  const parts = String(combo).toLowerCase().split("+").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) throw new Error("No key given");
  const key = parts.pop();
  const mods = parts.map((m) => { if (!(m in MOD)) throw new Error(`Unknown modifier "${m}"`); return MOD[m]; });
  let vk = VK[key] ?? MOD[key];
  if (vk === undefined && /^[a-z0-9]$/.test(key)) vk = key.toUpperCase().charCodeAt(0);
  if (vk === undefined) throw new Error(`Unknown key "${key}"`);
  return `[JIn]::Key(@(${mods.join(",")}), ${vk})`;
}

export class InputDriver {
  constructor() { this.proc = null; this.queue = []; this.ready = null; this.buf = ""; }

  start() {
    if (!IS_WIN) throw new Error("Mouse and keyboard control is only available on Windows.");
    if (this.ready) return this.ready;
    const encoded = Buffer.from(LOOP, "utf16le").toString("base64");
    this.proc = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], { windowsHide: true });
    this.proc.stdout.setEncoding("utf8");
    this.ready = new Promise((resolve, reject) => {
      this.onReady = resolve;
      this.proc.on("error", reject);
      this.proc.on("exit", (code) => {
        reject(new Error(`Input driver exited (${code})`));
        for (const q of this.queue) q.reject(new Error("Input driver stopped"));
        this.queue = []; this.proc = null; this.ready = null;
      });
    });
    this.proc.stdout.on("data", (d) => {
      this.buf += d;
      let i;
      while ((i = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1);
        if (line === "READY") { this.onReady(); continue; }
        const q = this.queue.shift();
        if (!q) continue;
        line.startsWith("ERR") ? q.reject(new Error(line.slice(4))) : q.resolve();
      }
    });
    return this.ready;
  }

  async run(command) {
    await this.start();
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
      this.proc.stdin.write(command.replace(/[\r\n]/g, " ") + "\n");
    });
  }

  move(x, y) { return this.run(`[JIn]::Move(${x | 0}, ${y | 0})`); }
  click(x, y, button = 0, count = 1) { return this.run(`[JIn]::Click(${x | 0}, ${y | 0}, ${button | 0}, ${count | 0})`); }
  drag(x1, y1, x2, y2) { return this.run(`[JIn]::Drag(${x1 | 0}, ${y1 | 0}, ${x2 | 0}, ${y2 | 0})`); }
  scroll(x, y, notches) { return this.run(`[JIn]::Scroll(${x | 0}, ${y | 0}, ${notches | 0})`); }
  type(text) { return this.run(`[JIn]::Type([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(String(text), "utf8").toString("base64")}')))`); }
  key(combo) { return this.run(keyCommand(combo)); }
  stop() { try { this.proc?.kill(); } catch {} }
}
