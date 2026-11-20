// Other apps' notifications (WhatsApp, Discord, Outlook, Teams…) mirrored into the island.
// Windows keeps every toast in a small SQLite database in the user's profile. Desktop apps
// can't subscribe to toasts without being a packaged Store app, so we read that database:
// copy it (plus its -wal/-shm journal) to a temp folder whenever it changes, and pick up
// toasts newer than the last one we saw. Read-only; nothing is changed or dismissed.
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";

const DB_DIR = () => path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Microsoft", "Windows", "Notifications");

const KNOWN = [
  [/whatsapp/i, "WhatsApp", "#25d366"], [/discord/i, "Discord", "#5865f2"], [/outlook|olk/i, "Outlook", "#0a64d6"],
  [/teams/i, "Teams", "#5b5fc7"], [/slack/i, "Slack", "#4a154b"], [/telegram/i, "Telegram", "#2aabee"],
  [/signal/i, "Signal", "#3a76f0"], [/messenger|facebook/i, "Messenger", "#0084ff"], [/instagram/i, "Instagram", "#e1306c"],
  [/spotify/i, "Spotify", "#1db954"], [/chrome/i, "Chrome", "#4285f4"], [/msedge|edge/i, "Edge", "#0c7cd5"],
  [/firefox/i, "Firefox", "#ff7139"], [/mail|windowscommunicationsapps/i, "Mail", "#0078d4"], [/zoom/i, "Zoom", "#2d8cff"],
  [/steam/i, "Steam", "#1b2838"], [/github/i, "GitHub", "#24292f"], [/notion/i, "Notion", "#37352f"],
];
function appOf(id = "") {
  for (const [re, name, color] of KNOWN) if (re.test(id)) return { name, color };
  const tail = id.split(/[!\\.]/).filter((x) => x && !/^(app|exe|microsoft|com|windows)$/i.test(x)).pop() || "App";
  return { name: tail.replace(/([a-z])([A-Z])/g, "$1 $2").slice(0, 18), color: "#636366" };
}
const IGNORE = /com\.jarvis\.desktop|Windows\.SystemToast|Microsoft\.Windows\.(Explorer|Shell|ActionCenter)|ScreenSketch|SecurityAndMaintenance/i;

const ent = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, "&");
export function parseToast(xml) {
  const texts = [...String(xml).matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)].map((m) => ent(m[1].replace(/<[^>]+>/g, "")).trim()).filter(Boolean);
  const launch = String(xml).match(/\blaunch="([^"]*)"/i)?.[1];
  return { title: texts[0] || "", body: texts.slice(1).join("\n"), launch: launch ? ent(launch) : "" };
}

export class WinNotifications {
  constructor({ onToast, log }) { this.onToast = onToast; this.log = log; this.lastId = null; this.stamp = ""; this.timer = null; this.failed = false; }
  async start() {
    if (process.platform !== "win32" || this.timer) return;
    let sqlite;
    try { sqlite = await import("node:sqlite"); }
    catch (e) { this.log(`notifications: SQLite isn't available in this build (${e.message})`); return; }
    this.DatabaseSync = sqlite.DatabaseSync;
    this.tmp = await fs.mkdtemp(path.join(os.tmpdir(), "jarvis-wpn-"));
    await this.poll(true);
    this.timer = setInterval(() => this.poll(false).catch(() => {}), 2500);
  }
  stop() { clearInterval(this.timer); this.timer = null; if (this.tmp) fs.rm(this.tmp, { recursive: true, force: true }).catch(() => {}); }
  async poll(first) {
    const dir = DB_DIR(), files = ["wpndatabase.db", "wpndatabase.db-wal", "wpndatabase.db-shm"];
    let stamp = "";
    for (const f of files) { try { const st = await fs.stat(path.join(dir, f)); stamp += st.mtimeMs + ":" + st.size + "|"; } catch { stamp += "-|"; } }
    if (stamp === this.stamp) return;
    this.stamp = stamp;
    try {
      // copy the database and its write-ahead log; SQLite rebuilds the -shm index itself (a copied one can be stale)
      await fs.rm(path.join(this.tmp, files[2]), { force: true });
      for (const f of files.slice(0, 2)) await fs.copyFile(path.join(dir, f), path.join(this.tmp, f)).catch((e) => { if (f.endsWith(".db")) throw e; return fs.rm(path.join(this.tmp, f), { force: true }); });
      const db = new this.DatabaseSync(path.join(this.tmp, "wpndatabase.db"));
      try {
        if (first || this.lastId === null) {
          this.lastId = db.prepare("SELECT MAX(Id) AS m FROM Notification").get()?.m || 0;
          this.log(`notifications: watching (last id ${this.lastId})`); this.failed = false; return;
        }
        const rows = db.prepare(`SELECT n.Id AS id, n.Payload AS payload, n.ArrivalTime AS t, h.PrimaryId AS app
          FROM Notification n JOIN NotificationHandler h ON h.RecordId = n.HandlerId
          WHERE n.Id > ? AND n.Type = 'toast' ORDER BY n.Id LIMIT 20`).all(this.lastId);
        for (const r of rows) {
          this.lastId = Math.max(this.lastId, Number(r.id));
          if (IGNORE.test(r.app || "")) continue;
          const xml = typeof r.payload === "string" ? r.payload : Buffer.from(r.payload || []).toString("utf8");
          const t = parseToast(xml);
          if (!t.title && !t.body) continue;
          const a = appOf(r.app);
          this.onToast({ appId: r.app, appName: a.name, color: a.color, title: t.title, body: t.body });
        }
      } finally { db.close(); }
    } catch (e) {
      if (!this.failed) this.log(`notifications: can't read the Windows notification list (${e.message})`);
      this.failed = true;
    }
  }
}
