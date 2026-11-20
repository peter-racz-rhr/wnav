// Download progress: watches the Downloads folder. Chrome and Edge write "name.crdownload",
// Firefox "name.part"; while one grows we report its size and speed, and when it turns into
// the finished file we report that (so the island can offer Open / Show in folder).
// Browsers don't tell other apps the total size, so progress is size + speed, not a percentage.
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

const PARTIAL = /\.(crdownload|part|download)$/i;
const finalName = (f) => f.replace(PARTIAL, "").replace(/^Unconfirmed \d+$/i, "");

export class DownloadWatcher {
  constructor({ dir, onUpdate, onDone, log }) { Object.assign(this, { dir, onUpdate, onDone, log }); this.active = new Map(); }
  start() {
    if (this.watcher) return;
    try { this.watcher = fs.watch(this.dir, () => this.scan()); }
    catch (e) { this.log?.(`downloads: can't watch ${this.dir} (${e.message})`); return; }
    this.timer = setInterval(() => this.scan(), 1000);
    this.scan();
  }
  stop() { this.watcher?.close(); this.watcher = null; clearInterval(this.timer); }
  async scan() {
    if (this.busy) return; this.busy = true;
    try {
      const names = await fsp.readdir(this.dir).catch(() => []);
      const now = Date.now(), seen = new Set();
      for (const n of names) {
        if (!PARTIAL.test(n)) continue;
        seen.add(n);
        const st = await fsp.stat(path.join(this.dir, n)).catch(() => null);
        if (!st) continue;
        let d = this.active.get(n);
        if (!d) { d = { id: n, name: finalName(n) || "Download", size: st.size, at: now, speed: 0, start: now, since: st.mtimeMs }; this.active.set(n, d); }
        const dt = (now - d.at) / 1000;
        if (dt >= 0.9) { const inst = Math.max(0, (st.size - d.size) / dt); d.speed = d.speed ? d.speed * 0.6 + inst * 0.4 : inst; d.size = st.size; d.at = now; }
        if (now - st.mtimeMs < 60e3) this.onUpdate({ id: d.id, name: d.name, size: d.size, speed: d.speed });
      }
      for (const [n, d] of this.active) {
        if (seen.has(n)) continue;
        this.active.delete(n);
        if (/^Unconfirmed \d+\./i.test(n) && seen.size) {   // just renamed to its real name: carry on under that one
          const next = [...seen].map((x) => this.active.get(x)).find((x) => x && x.start >= d.start);
          if (next) { next.start = d.start; this.onDone({ id: d.id, name: d.name, cancelled: true, renamed: true }); continue; }
        }
        // Chrome renames "Unconfirmed 123.crdownload" → "real name.crdownload" → "real name"; find the result
        const guess = names.filter((x) => !PARTIAL.test(x)).map((x) => ({ x, p: path.join(this.dir, x) }));
        let best = null;
        for (const g of guess) {
          const st = await fsp.stat(g.p).catch(() => null);
          if (st && st.isFile() && st.mtimeMs >= d.start - 2000 && (!best || st.mtimeMs > best.t)) best = { ...g, t: st.mtimeMs, size: st.size };
        }
        const exact = d.name && guess.find((g) => g.x === d.name);
        const done = exact ? { ...exact, size: (await fsp.stat(exact.p).catch(() => ({ size: d.size }))).size } : /^Unconfirmed/i.test(n) ? best : null;
        if (done) this.onDone({ id: d.id, name: done.x, path: done.p, size: done.size });
        else this.onDone({ id: d.id, name: d.name, cancelled: true });
      }
    } finally { this.busy = false; }
  }
}
