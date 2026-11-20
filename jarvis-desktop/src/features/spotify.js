// Real Spotify control through the Spotify Web API, signed in with PKCE (no client secret).
// The user makes a free Spotify developer app once, pastes its Client ID in Settings, and adds
// the redirect URI http://127.0.0.1:47824/spotify/callback. One-click playback needs Premium;
// without it we fall back to opening the song in the Spotify app.
import http from "node:http";
import crypto from "node:crypto";

export const SPOTIFY_REDIRECT = "http://127.0.0.1:47824/spotify/callback";
const SCOPES = "user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private playlist-modify-private playlist-modify-public user-library-modify";
const b64url = (b) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export class Spotify {
  constructor({ clientId, getRefresh, setRefresh, openUrl, openUri, log }) {
    Object.assign(this, { clientId, getRefresh, setRefresh, openUrl, openUri, log }); this.access = null; this.expires = 0;
  }
  get connected() { return !!this.getRefresh(); }

  // Opens the browser on Spotify's consent page; resolves once the user has agreed.
  connect() {
    const id = this.clientId();
    if (!id) return Promise.reject(new Error("Paste your Spotify Client ID in Settings first."));
    const verifier = b64url(crypto.randomBytes(48)), state = b64url(crypto.randomBytes(12));
    const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
    return new Promise((resolve, reject) => {
      const srv = http.createServer(async (req, res) => {
        const u = new URL(req.url, SPOTIFY_REDIRECT);
        if (u.pathname !== "/spotify/callback") { res.writeHead(404); return res.end(); }
        const done = (ok, msg) => { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(`<body style="font:16px system-ui;background:#000;color:#fff;display:grid;place-items:center;height:90vh"><p>${ok ? "✓ Spotify is connected. You can close this tab." : "Spotify didn't connect: " + msg}</p></body>`); clearTimeout(tm); srv.close(); };
        if (u.searchParams.get("state") !== state || !u.searchParams.get("code")) { done(false, u.searchParams.get("error") || "cancelled"); return reject(new Error("Spotify sign-in was cancelled.")); }
        try {
          await this.token({ grant_type: "authorization_code", code: u.searchParams.get("code"), redirect_uri: SPOTIFY_REDIRECT, code_verifier: verifier });
          done(true); resolve(true);
        } catch (e) { done(false, e.message); reject(e); }
      });
      const tm = setTimeout(() => { srv.close(); reject(new Error("Spotify sign-in timed out.")); }, 5 * 60e3);
      srv.on("error", (e) => reject(e));
      srv.listen(47824, "127.0.0.1", () => {
        const q = new URLSearchParams({ client_id: id, response_type: "code", redirect_uri: SPOTIFY_REDIRECT, code_challenge_method: "S256", code_challenge: challenge, scope: SCOPES, state });
        this.openUrl(`https://accounts.spotify.com/authorize?${q}`);
      });
    });
  }
  disconnect() { this.setRefresh(""); this.access = null; }

  async token(params) {
    const res = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: this.clientId(), ...params }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { if (params.grant_type === "refresh_token" && j.error === "invalid_grant") this.setRefresh(""); throw new Error(j.error_description || j.error || `Spotify answered ${res.status}`); }
    this.access = j.access_token; this.expires = Date.now() + (j.expires_in - 60) * 1000;
    if (j.refresh_token) this.setRefresh(j.refresh_token);
  }
  async api(method, path, body) {
    if (!this.access || Date.now() > this.expires) {
      if (!this.getRefresh()) throw Object.assign(new Error("Spotify isn't connected."), { code: "NO_SPOTIFY" });
      await this.token({ grant_type: "refresh_token", refresh_token: this.getRefresh() });
    }
    const res = await fetch("https://api.spotify.com/v1" + path, { method, headers: { Authorization: `Bearer ${this.access}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 204 || res.status === 202) return null;
    const j = await res.json().catch(() => null);
    if (!res.ok) throw Object.assign(new Error(j?.error?.message || `Spotify answered ${res.status}`), { status: res.status, reason: j?.error?.reason });
    return j;
  }

  async search(q, type = "track", limit = 5) { return this.api("GET", `/search?${new URLSearchParams({ q, type, limit: String(limit) })}`); }
  // Start playback; wakes the Spotify app if no device is active. → { ok, title, artist, art, fallback? }
  async startPlayback(body, openUri) {
    try { await this.api("PUT", "/me/player/play", body); return { ok: true }; }
    catch (e) {
      if (e.status === 403 || /premium/i.test(e.message + e.reason)) { this.openUri(openUri); return { ok: false, fallback: "premium" }; }
      if (e.status !== 404) throw e;
      let dev = (await this.api("GET", "/me/player/devices"))?.devices || [];
      if (!dev.length) { this.openUri("spotify:"); await new Promise((r) => setTimeout(r, 4000)); dev = (await this.api("GET", "/me/player/devices"))?.devices || []; }
      const d = dev.find((x) => x.type === "Computer") || dev[0];
      if (!d) { this.openUri(openUri); return { ok: false, fallback: "device" }; }
      await this.api("PUT", `/me/player/play?device_id=${d.id}`, body);
      return { ok: true };
    }
  }
  async play(query) {
    const q = String(query).trim();
    const wantList = /\bplaylist\b/i.test(q), wantAlbum = /\balbum\b/i.test(q), wantArtist = /^(some(thing)? (by|from)|music (by|from)|songs (by|from))\b/i.test(q);
    const clean = q.replace(/\b(the )?(playlist|album)\b|^(some(thing)?|music|songs) (by|from)\s+/gi, "").replace(/\s+on spotify$/i, "").trim();
    if (wantList || wantAlbum || wantArtist) {
      const type = wantList ? "playlist" : wantAlbum ? "album" : "artist";
      const item = (await this.search(clean, type, 3))?.[type + "s"]?.items?.filter(Boolean)[0];
      if (!item) return { ok: false, notFound: true };
      const r = await this.startPlayback({ context_uri: item.uri }, item.uri);
      return { ...r, title: item.name, artist: item.owner?.display_name || item.artists?.[0]?.name || "", art: item.images?.[0]?.url, kind: type };
    }
    const t = (await this.search(clean, "track", 1))?.tracks?.items?.[0];
    if (!t) return { ok: false, notFound: true };
    const r = await this.startPlayback({ uris: [t.uri] }, t.uri);
    return { ...r, title: t.name, artist: t.artists.map((a) => a.name).join(", "), art: t.album?.images?.[0]?.url, kind: "track" };
  }
  async current() {
    const c = await this.api("GET", "/me/player/currently-playing");
    return c?.item ? { id: c.item.id, uri: c.item.uri, title: c.item.name, artist: c.item.artists?.map((a) => a.name).join(", "), artistUri: c.item.artists?.[0]?.uri, artistName: c.item.artists?.[0]?.name } : null;
  }
  async like() { const c = await this.current(); if (!c) return null; await this.api("PUT", `/me/tracks?ids=${c.id}`); return c; }
  async addToPlaylist(name) {
    const c = await this.current(); if (!c) return { error: "Nothing is playing in Spotify." };
    if (!name || /^(liked|favou?rites?|my library)/i.test(name)) { await this.api("PUT", `/me/tracks?ids=${c.id}`); return { track: c, playlist: "Liked Songs" }; }
    const mine = (await this.api("GET", "/me/playlists?limit=50"))?.items || [];
    const n = name.toLowerCase().trim();
    const pl = mine.find((p) => p.name.toLowerCase() === n) || mine.find((p) => p.name.toLowerCase().includes(n));
    if (!pl) return { error: `I can't find a playlist called “${name}”.`, playlists: mine.slice(0, 8).map((p) => p.name) };
    await this.api("POST", `/playlists/${pl.id}/tracks`, { uris: [c.uri] });
    return { track: c, playlist: pl.name };
  }
  // "Play something like this": Spotify retired its recommendations API for new apps, so this
  // plays the current artist's catalogue on shuffle, which is the closest honest equivalent.
  async moreLikeThis() {
    const c = await this.current(); if (!c?.artistUri) return { error: "Nothing is playing in Spotify." };
    await this.api("PUT", "/me/player/shuffle?state=true").catch(() => {});
    const r = await this.startPlayback({ context_uri: c.artistUri }, c.artistUri);
    return { ...r, artist: c.artistName };
  }
}

// Synced lyrics from LRCLIB (free, no key). → [{ t: seconds, line }] or null
export async function fetchLyrics({ title, artist, duration }) {
  const q = new URLSearchParams({ track_name: title, artist_name: artist });
  if (duration) q.set("duration", String(Math.round(duration)));
  const get = async (url) => { const r = await fetch(url, { headers: { "User-Agent": "Jarvis-desktop" } }); return r.ok ? r.json() : null; };
  let j = await get(`https://lrclib.net/api/get?${q}`);
  if (!j?.syncedLyrics) {
    const list = await get(`https://lrclib.net/api/search?${new URLSearchParams({ track_name: title, artist_name: artist })}`);
    j = (list || []).find((x) => x.syncedLyrics && (!duration || Math.abs(x.duration - duration) < 6)) || null;
  }
  if (!j?.syncedLyrics) return null;
  const out = [];
  for (const l of j.syncedLyrics.split("\n")) {
    const m = l.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/);
    if (m) out.push({ t: +m[1] * 60 + +m[2], line: m[3].trim() });
  }
  return out.length ? out : null;
}
