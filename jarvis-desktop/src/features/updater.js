// Auto-update from this project's GitHub releases (tags "jarvis-vX.Y.Z", asset Jarvis-Setup-X.Y.Z.exe).
// Checks at start and every few hours, downloads the new installer in the background, then the
// island offers "Update ready · Restart". The repo is private for now, so a read-only GitHub token
// (Settings) is needed until it goes public; without one the check quietly does nothing.
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";

const REPO = "peter-racz-rhr/wnav";
const newer = (a, b) => {   // is version a newer than b
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};

export class Updater {
  constructor({ version, token, onReady, log }) { Object.assign(this, { version, token, onReady, log }); this.ready = null; this.busy = false; }
  headers(extra = {}) {
    const h = { "User-Agent": "Jarvis-desktop", Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...extra };
    const t = this.token?.(); if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }
  start() {
    if (process.platform !== "win32" || this.timer) return;
    setTimeout(() => this.check().catch(() => {}), 45e3);
    this.timer = setInterval(() => this.check().catch(() => {}), 4 * 3600e3);
  }
  stop() { clearInterval(this.timer); this.timer = null; }
  async check() {
    if (this.busy || this.ready) return this.ready;
    this.busy = true;
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=15`, { headers: this.headers() });
      if (res.status === 404 || res.status === 401) { this.log(`update: releases not reachable (${res.status}${this.token?.() ? "" : ", no token set"})`); return null; }
      if (!res.ok) { this.log(`update: GitHub answered ${res.status}`); return null; }
      const rel = (await res.json()).filter((r) => !r.draft && !r.prerelease && /^jarvis-v\d+\.\d+\.\d+$/.test(r.tag_name))
        .sort((a, b) => (newer(a.tag_name.slice(8), b.tag_name.slice(8)) ? -1 : 1))[0];
      if (!rel) return null;
      const v = rel.tag_name.slice(8);
      if (!newer(v, this.version)) return null;
      const asset = rel.assets.find((a) => /^Jarvis-Setup-.*\.exe$/i.test(a.name));
      if (!asset) return null;
      const file = path.join(os.tmpdir(), asset.name);
      const have = await fsp.stat(file).catch(() => null);
      if (!have || have.size !== asset.size) {
        this.log(`update: downloading ${v}`);
        const dl = await fetch(asset.url, { headers: this.headers({ Accept: "application/octet-stream" }), redirect: "follow" });
        if (!dl.ok || !dl.body) throw new Error(`download answered ${dl.status}`);
        await pipeline(Readable.fromWeb(dl.body), fs.createWriteStream(file + ".part"));
        await fsp.rename(file + ".part", file);
      }
      this.ready = { version: v, file, notes: String(rel.body || "").split("\n").filter((l) => l.trim()).slice(0, 4).join("\n") };
      this.log(`update: ${v} ready`);
      this.onReady(this.ready);
      return this.ready;
    } catch (e) { this.log(`update: ${e.message}`); return null; }
    finally { this.busy = false; }
  }
  // Silent install, then the installer starts the new Jarvis (--force-run). The caller quits the app.
  install() {
    if (!this.ready) return false;
    spawn(this.ready.file, ["/S", "--force-run"], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    return true;
  }
}
