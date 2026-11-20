// Jarvis island (desktop). Same look and behaviour as the web prototype, wired to the real app:
// listening uses local Whisper, general questions go to Claude (with a live "working / needs your
// OK / ready" activity), music comes from the Windows media session, the shelf opens real files,
// and quick things (weather, timers, maths, currency, notes, translate, media keys) run locally.
const J = window.jarvis;
const $ = (id) => document.getElementById(id);
const island = $("island");
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmt = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
const cap = (x) => String(x).replace(/\b\w/g, (c) => c.toUpperCase());
const ICON = {
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  weather: '<path d="M7 18a4 4 0 0 1 0-8 6 6 0 0 1 11.5 1.5A3.5 3.5 0 0 1 18 18z"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
  note: '<path d="M5 4h11l3 3v13H5z"/><path d="M9 10h6M9 14h6"/>',
  pc: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>',
  claude: '<path d="M12 3l1.8 6.2L20 7.5l-4.6 4.5L20 16.5l-6.2-1.7L12 21l-1.8-6.2L4 16.5l4.6-4.5L4 7.5l6.2 1.7z"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
  down: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  clip: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h4"/>',
  focus: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  update: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
};

// ---------------- state ----------------
let s = "idle", hover = false, cardOpen = false, mode = "dock", pulling = null;
let timer = null, music = null, hud = null, dragOver = false, shelf = [];
let task = null, flashTask = 0, taskPinned = false, notifs = [], unread = 0, notifShow = 0;
const ext = new Map();   // Claude Code sessions running on this PC: id → { project, prompt, steps, status, start, updated }
let extPinned = false, extFlash = 0, extDone = null, rowHtml = "";
let settings = {};
let hidden = false, peekT = null;
// tucked into a small bump: flicked up by you, or out of the way of a full-screen / maximized app
let carry = false;   // being dragged out of the onboarding window
let autoHidden = false, revealed = false, bumpPull = 0, wobble = 0, lastOver = 0;
const tucked = () => mode === "dock" && (hidden || autoHidden) && !revealed && !needsYou();
const perms = new Map();   // Claude Code permission requests waiting for Allow / Deny: id → request
let clips = [], dls = new Map(), focus = null, cal = [], mail = null, update = "", lyrics = null, suggestion = null, curLayer = null;
function setS(v, text) { s = v; island.dataset.s = v; if (text !== undefined) $("statusText").textContent = text; }

// ---------------- geometry: one black shape that springs between sizes ----------------
const box = { x: innerWidth / 2 - 63, y: 10, w: 126, h: 36, vx: 0, vy: 0, vw: 0, vh: 0 };
const WPOS = { x: 20, y: 20 };   // where the island sits inside the window in widget mode
let target = null;
const TEAR = 150;
function contentH() { return $("lCard").scrollHeight; }
function needsYou() {   // even when hidden, the island comes out for these
  return s !== "idle" || pendingApproval() || perms.size > 0 || performance.now() < notifShow || (task && performance.now() < flashTask) || cardOpen || dragOver;
}
function shape() {
  const cx = innerWidth / 2, at = (w, h, layer, r) => ({ x: cx - w / 2, y: 10, w, h, layer, r: r ?? h / 2 });
  if (carry) return at(150, 40, "lStatus");
  if (tucked()) {   // the bump: a little drop hanging from the top edge; pulling stretches it like liquid
    const w = bumpPull ? Math.max(36, 70 - bumpPull * .5) : hover ? 84 : 70, h = bumpPull ? 26 + bumpPull * .85 : hover ? 32 : 26;
    return { x: cx - w / 2, y: -10, w, h, layer: null, r: w / 2, bump: true };
  }
  if (mode === "widget") return { x: WPOS.x, y: WPOS.y, w: 400, h: Math.max(160, contentH()), layer: "lCard", r: 28 };
  if (dragOver) return at(260, 48, "lDrop");
  if (s === "listening") return at(300, 48, "lStatus");
  if (s === "thinking") return at(240, 42, "lStatus");
  if (hud && performance.now() < hud.until) return at(220, 40, "lHud");
  if (performance.now() < notifShow) { if (hover) notifShow = Math.max(notifShow, performance.now() + 800); return at(360, 60, "lNotif"); }
  if (task && performance.now() < flashTask) return at(240, 44, "lTask");
  if (cardOpen) return at(400, contentH(), "lCard", 28);
  if (task && task.status !== "done") return hover || taskPinned ? at(400, contentH(), "lCard", 28) : at(330, 44, "lTask");
  const es = activeExt();
  if (!task && (es || performance.now() < extFlash)) return es && (hover || extPinned) ? at(400, contentH(), "lCard", 28) : at(340, 44, "lTask");
  if (meetingSoon()) return at(hover ? 352 : 336, 44, "lMeet");
  if (activeDl()) return at(hover ? 352 : 336, 44, "lDl");
  const mh = hover && music?.playing && lyricNow() ? 84 : 56;
  if (timer && music) return at(hover ? 312 : 300, mh, "lMusic");
  if (timer) return at(hover ? 196 : 180, 38, "lTimer");
  if (music) return at(hover ? 312 : 300, mh, "lMusic");
  if (hover) return at(170, 40, "lStatus");
  return at(126, 36, null);
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(.033, (now - last) / 1000); last = now;
  drawRings(now);
  if (music) drawMusic();
  const sh = shape();
  if (!pulling || !pulling.moved || pulling.bump || mode === "widget") target = sh;
  const k = pulling ? 520 : now < wobble ? 340 : 290, c = pulling ? 34 : now < wobble ? 13 : 23;   // looser just after it pours out of the bump
  for (const [p, v] of [["x", "vx"], ["y", "vy"], ["w", "vw"], ["h", "vh"]]) { box[v] += (k * (target[p] - box[p]) - c * box[v]) * dt; box[p] += box[v] * dt; }
  Object.assign(island.style, { left: box.x + "px", top: box.y + "px", width: box.w + "px", height: box.h + "px", borderRadius: sh.bump ? "0 0 50% 50% / 0 0 64% 64%" : Math.min(sh.r, box.h / 2) + "px" });
  island.classList.toggle("bump", !!sh.bump);
  island.classList.toggle("busy", !!sh.bump && (!!activeExt() || (task && task.status !== "done")));   // Claude working while tucked: an orange dot
  for (const id of ["lStatus", "lTimer", "lMusic", "lCard", "lHud", "lDrop", "lTask", "lNotif", "lMeet", "lDl"]) $(id).classList.toggle("on", id === sh.layer);
  curLayer = sh.layer;
  if (sh.layer === "lMeet") setRow("meetRow", meetRowHtml(meetingSoon()));
  if (sh.layer === "lDl") setRow("dlRow", dlRowHtml());
  document.body.classList.toggle("focusing", !!(timer && timer.focus));
  if (sh.layer === "lStatus" && s === "idle") $("statusText").textContent = carry ? "Jarvis" : "Click to talk";
  $("count").textContent = unread; $("count").classList.toggle("on", unread > 0 && !sh.layer);
  if (task && task.status !== "done" && (hover || taskPinned) && sh.layer === "lCard" && !cardOpen && $("card").dataset.task !== "1") renderTaskCard();
  if (!task && sh.layer === "lTask") { const h = extRowHtml(); if (h !== rowHtml) { rowHtml = h; $("taskRow").innerHTML = h; } }
  else if (sh.layer === "lTask") rowHtml = "";
  if (!task && activeExt() && (hover || extPinned) && sh.layer === "lCard" && !cardOpen) renderExtCard();

  const dual = mode === "dock" && timer && music && !cardOpen && s === "idle" && sh.layer === "lMusic";
  $("bubble").classList.toggle("on", !!dual);
  if (dual) Object.assign($("bubble").style, { left: box.x + box.w + 8 + "px", top: box.y + (box.h - 38) / 2 + "px" });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------- pointer: the window is click-through except over the island ----------------
let interactive = false;
function setInteractive(on) { if (on !== interactive) { interactive = on; J.hover(on); } }
const overIsland = (x, y) => x >= box.x - 8 && x <= box.x + box.w + 8 && y >= box.y - 8 && y <= box.y + box.h + 8;
addEventListener("mousemove", (e) => {
  if (pulling || carry) return;
  const over = overIsland(e.clientX, e.clientY) || ($("typed").classList.contains("on"));
  setInteractive(over);
  if (mode === "dock") {
    const was = hover, t = tucked();
    hover = over || (!t && e.clientY < 70 && Math.abs(e.clientX - innerWidth / 2) < 120);
    if (hover) lastOver = performance.now();
    if (hover && !was && !t) maybeBrief();
  }
});
addEventListener("mouseleave", () => { if (!pulling) { setInteractive(false); hover = false; } });

island.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || e.target.closest("button:not(.w-mic),.play,a,li[data-n],li[data-f]")) return;
  if (mode === "widget" && !e.target.closest(".w-top,.w-mic")) return;
  pulling = { y0: e.screenY, x0: e.screenX, moved: false, mic: !!e.target.closest(".w-mic"), handle: !!e.target.closest(".w-top"), bump: tucked() };
  island.setPointerCapture(e.pointerId);
  if (mode === "widget" && pulling.handle) { pulling.moved = true; J.dragStart(); }
});
island.addEventListener("pointermove", (e) => {
  if (!pulling || mode === "widget") return;
  const dx = e.screenX - pulling.x0, dy = e.screenY - pulling.y0;
  if (!pulling.moved && Math.hypot(dx, dy) < 6) return;
  if (pulling.bump) {                                   // pulling the bump: it stretches, then pours out
    pulling.moved = true; bumpPull = Math.max(0, dy);
    if (dy > 44) { pulling = null; reveal(); }
    return;
  }
  if (!pulling.moved && dy < 0 && Math.abs(dy) > Math.abs(dx)) {   // flick up → hide
    pulling = null; hideIsland(); return;
  }
  pulling.moved = true;
  const base = shape(), pull = Math.max(0, dy), t = Math.min(1, pull / TEAR);
  const w = Math.max(120, base.w * (1 - .15 * t)), h = base.h + pull * .5;
  target = { ...base, x: innerWidth / 2 - w / 2 + dx * .2, y: 10 + pull * .25, w, h };
  if (pull > TEAR) {                                   // snap: tear off into a widget that follows the mouse
    mode = "widget"; cardOpen = false; island.classList.add("widget"); $("wTop").hidden = false;
    box.x = WPOS.x; box.y = WPOS.y;
    if (!$("card").innerHTML || $("card").dataset.task === "1") render({ icon: "info", kicker: "Ready", title: "Ask anything", body: "Press the button below and talk." });
    else addWidgetBits();
    J.tear();
  }
});
island.addEventListener("pointerup", () => {
  if (!pulling) return;
  const p = pulling; pulling = null;
  if (mode === "widget" && p.moved) { J.dragEnd(); return; }
  if (p.bump) { if (p.moved) bumpPull = 0; else reveal(); return; }
  if (p.moved) return;                                  // let go before tearing: springs back
  if (mode === "dock" && performance.now() < notifShow && suggestion) { const sg = suggestion; suggestion = null; notifShow = 0; sg.run(); return; }
  if (mode === "dock" && performance.now() < notifShow && notifs[0]) { notifShow = 0; unread = Math.max(0, unread - 1); show(notifDetail(notifs[0])); return; }
  if (mode === "dock" && task && task.status !== "done") { taskPinned = !taskPinned; if (!taskPinned) $("card").dataset.task = ""; return; }
  if (mode === "dock" && !task && activeExt()) { extPinned = !extPinned; if (!extPinned) $("card").dataset.task = ""; return; }
  if (mode === "dock" && curLayer === "lMeet") { show(agendaCard()); return; }
  if (mode === "dock" && curLayer === "lDl") { show(downloadsCard()); return; }
  if (mode === "dock" && music && !cardOpen && s === "idle" && !timer && !unread) { show(nowPlaying()); return; }
  if (mode === "dock" && unread && !cardOpen && s === "idle") { show(notifCenter()); unread = 0; return; }
  if (mode === "dock" || p.mic) talk();
});
island.addEventListener("contextmenu", (e) => { e.preventDefault(); J.menu(); });
// click anywhere outside → collapse back to the pill (the window gets focus while you use the island)
addEventListener("blur", () => { if (mode === "dock" && (cardOpen || taskPinned) && !pendingApproval()) { cardOpen = false; taskPinned = false; $("card").dataset.task = ""; } });
addEventListener("pointerdown", (e) => {
  if (mode !== "dock" || island.contains(e.target) || e.target.closest("#typed")) return;
  if ((cardOpen || taskPinned || extPinned) && !pendingApproval()) { cardOpen = false; taskPinned = false; extPinned = false; $("card").dataset.task = ""; }
});
J.onIslandMode(applyMode);
function applyMode(m) {
  mode = m === "widget" ? "widget" : "dock";
  island.classList.toggle("widget", mode === "widget"); $("wTop").hidden = mode !== "widget";
  if (mode === "dock") { $("card").querySelectorAll(".w-mic,.w-hint").forEach((el) => el.remove()); cardOpen = !!$("card").innerHTML && $("card").dataset.task !== "1"; box.x = innerWidth / 2 - box.w / 2; box.y = 10; }
  else { box.x = WPOS.x; box.y = WPOS.y; if (!$("card").innerHTML) render({ icon: "info", kicker: "Ready", title: "Ask anything", body: "Press the button below and talk." }); addWidgetBits(); }
}

// ---------------- listening: local Whisper ----------------
const WORKLET = URL.createObjectURL(new Blob([`
  class R extends AudioWorkletProcessor { process(i) { const c = i[0] && i[0][0]; if (c) this.port.postMessage(c.slice(0)); return true; } }
  registerProcessor("rec", R);`], { type: "text/javascript" }));
let rec = null;
async function talk() {
  if (rec) return stopListening();
  if (s !== "idle") return;
  if (settings.ready === false) return J.openPanel("setup");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const ctx = new AudioContext({ sampleRate: 16000 });
    const src = ctx.createMediaStreamSource(stream);
    let node, port;
    try { await ctx.audioWorklet.addModule(WORKLET); node = new AudioWorkletNode(ctx, "rec"); port = node.port; src.connect(node); }
    catch {
      node = ctx.createScriptProcessor(2048, 1, 1);
      port = { set onmessage(fn) { node.onaudioprocess = fn ? (e) => fn({ data: e.inputBuffer.getChannelData(0).slice(0) }) : null; } };
      const mute = ctx.createGain(); mute.gain.value = 0; src.connect(node); node.connect(mute); mute.connect(ctx.destination);
    }
    rec = { stream, ctx, node, port, chunks: [], n: 0, t0: performance.now(), speechAt: 0, lastVoice: 0, floor: 0, fN: 0 };
    port.onmessage = ({ data }) => onAudio(data);
  } catch {
    return show({ icon: "info", kicker: "Microphone", title: "I can't hear you", body: "Allow the microphone in Windows Settings → Privacy & security → Microphone, then try again." });
  }
  cardOpen = false; setS("listening", "Listening…");
}
function onAudio(chunk) {
  if (!rec) return;
  rec.chunks.push(chunk); rec.n += chunk.length;
  let sum = 0; for (const x of chunk) sum += x * x;
  const rms = Math.sqrt(sum / chunk.length), now = performance.now(), t = now - rec.t0;
  if (t < 300) rec.floor = (rec.floor * rec.fN + rms) / ++rec.fN;
  if (rms > Math.max(0.012, rec.floor * 2.5)) { rec.lastVoice = now; if (!rec.speechAt) rec.speechAt = now; }
  document.querySelectorAll("#bars i").forEach((b, i) => (b.style.height = 4 + Math.min(12, rms * 240 * (0.6 + 0.4 * Math.sin(now / 90 + i))) + "px"));
  if (rec.speechAt && now - rec.lastVoice > 900) stopListening();
  else if (!rec.speechAt && t > 7000) stopListening(true);
  else if (t > 45000) stopListening();
}
async function stopListening(silent = false) {
  if (!rec) return;
  const r = rec; rec = null;
  r.port.onmessage = null; r.stream.getTracks().forEach((t) => t.stop()); r.ctx.close();
  if (silent || !r.speechAt || r.n < 16000 * 0.35) { setS("idle"); return; }
  const audio = new Float32Array(r.n); let o = 0; for (const c of r.chunks) { audio.set(c, o); o += c.length; }
  setS("thinking", "Transcribing");
  let text = "";
  try { text = await J.transcribe(audio); }
  catch (e) { setS("idle"); return show({ icon: "info", kicker: "Hearing", title: "Speech recognition failed", body: String(e.message || e).replace(/^Error invoking remote method '[^']+': /, "") }); }
  if (!text || /^\[.*\]$|^\(.*\)$/.test(text)) { setS("idle"); return; }
  handle(text);
}
function openTyped() { setS("idle"); J.focusIsland(); $("typed").classList.add("on"); setInteractive(true); setTimeout(() => $("typedIn").focus(), 30); }
$("typed").onsubmit = (e) => { e.preventDefault(); const t = $("typedIn").value.trim(); $("typedIn").value = ""; $("typed").classList.remove("on"); if (t) handle(t); };
addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "t" && document.activeElement !== $("typedIn")) { e.preventDefault(); openTyped(); }
  if (e.key === "Escape") { $("typed").classList.remove("on"); if (rec) stopListening(true); if (!pendingApproval()) { cardOpen = false; taskPinned = false; } }
  if ((e.key === "Enter" || e.key === " ") && document.activeElement === island) { e.preventDefault(); talk(); }
});
J.onTalk(() => talk());
J.onToggleHide(() => (hidden ? showIsland() : hideIsland()));
function hideIsland() {
  if (pendingApproval()) return;
  hidden = true; revealed = false; hover = false; cardOpen = false; taskPinned = false; $("card").dataset.task = "";
  setInteractive(false);
}
function showIsland() { hidden = false; reveal(); }
// out of the bump with a liquid overshoot: it drops, squeezes narrow, then settles
function reveal() {
  bumpPull = 0;
  if (hidden) hidden = false; else if (autoHidden) revealed = true;
  wobble = performance.now() + 800; lastOver = performance.now();
  box.vh += 420; box.vw -= 260;
}
J.onCarry?.((on) => { carry = !!on; if (on) { box.w = 150; box.h = 40; box.x = innerWidth / 2 - 75; box.y = 10; box.vx = box.vy = box.vw = box.vh = 0; } });
// dropped at the top of the screen: it lands where you let go and springs into the top edge like a drop of ink
J.onSnap?.(({ x, y }) => {
  carry = false;
  box.x = x - box.w / 2; box.y = y - box.h / 2;
  box.vy = -500; box.vw = 520; box.vh = -160;
  wobble = performance.now() + 1100;
});
J.onAutoHide?.((on) => { autoHidden = !!on; if (!on) revealed = false; });
// shown from the bump over a full-screen app: tuck back once you've moved away and nothing is open
setInterval(() => {
  if (revealed && !hover && !cardOpen && !taskPinned && !extPinned && s === "idle" && performance.now() - lastOver > 1600) revealed = false;
}, 400);

// ---------------- one card layout for every answer ----------------
let lastAnswer = null, closeT = null;
function cardHTML(a) {
  const parts = [
    a.bare ? "" : `<div class="kicker"><svg viewBox="0 0 24 24">${ICON[a.icon] || ICON.info}</svg>${esc(a.kicker)}${a.said ? `<span class="said">“${esc(a.said)}”</span>` : ""}</div>`,
    a.title ? `<div class="title">${esc(a.title)}</div>` : "",
    a.html || "",
    a.body ? `<div class="body">${esc(a.body)}</div>` : "",
    a.chips?.length ? `<div class="chips">${a.chips.map((c, i) => `<button class="chip ${c.danger ? "danger" : i === 0 ? "primary" : ""}" data-chip="${i}">${esc(c.label)}</button>`).join("")}</div>` : "",
    a.note ? `<div class="note">${esc(a.note)}</div>` : "",
  ].filter(Boolean);
  return parts.map((p, i) => p.replace(/^<(\w+)/, `<$1 style="--i:${i}"`)).join("");
}
function render(a) {
  lastAnswer = a;
  $("card").innerHTML = cardHTML(a);
  $("card").dataset.task = "";
  $("card").querySelectorAll(".list li,.tracks li").forEach((li, j) => li.style.setProperty("--j", j));
  $("card").querySelectorAll("[data-chip]").forEach((b) => (b.onclick = () => a.chips[+b.dataset.chip].run?.()));
  a.after?.();
  if (mode === "widget") addWidgetBits();
}
function addWidgetBits() {
  if ($("card").querySelector(".w-mic")) return;
  $("card").insertAdjacentHTML("beforeend", `<button class="w-mic" title="Talk"></button><p class="w-hint">Drag the handle · drop on the top edge to dock</p>`);
}
function show(a) {
  render(a); setS("idle");
  $("live").textContent = [a.title, a.body].filter(Boolean).join(". ") || a.kicker || "";
  if (mode === "dock") { cardOpen = true; clearTimeout(closeT); closeT = setTimeout(autoClose, a.stay ? 30000 : 14000); }
}
function autoClose() { if (hover || pendingApproval()) return (closeT = setTimeout(autoClose, 3000)); cardOpen = false; }
// short markdown-ish text from Claude → paragraphs and bullet lists
function md(text) {
  const lines = String(text).trim().split(/\n+/);
  let html = "", list = false;
  for (const raw of lines) {
    const l = raw.trim(); if (!l) continue;
    const b = l.match(/^[-*•]\s+(.*)/) || l.match(/^\d+[.)]\s+(.*)/);
    if (b) { if (!list) { html += "<ul>"; list = true; } html += `<li>${esc(b[1]).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")}</li>`; }
    else { if (list) { html += "</ul>"; list = false; } html += `<p>${esc(l.replace(/^#+\s*/, "")).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")}</p>`; }
  }
  return html + (list ? "</ul>" : "");
}

// ---------------- what to do with a request ----------------
async function handle(text) {
  setS("thinking", "Thinking");
  const t = text.toLowerCase().trim().replace(/[.!?]+$/, "");
  let a;
  try {
    if (/^(pause|resume|stop) (the )?(music|song|playback)$|^(pause|resume)$/.test(t)) { J.mediaKey("play_pause"); a = media(text, "Play / pause"); }
    else if (/^(next|skip)( song| track)?$/.test(t)) { J.mediaKey("next"); a = media(text, "Next track"); }
    else if (/^(previous|go back|last)( song| track)?$/.test(t)) { J.mediaKey("previous"); a = media(text, "Previous track"); }
    else if (/^(turn (it |the volume )?(up|down)|volume (up|down)|louder|quieter|mute)$/.test(t)) a = volumeIntent(t);
    else if (/^(play )?(something|more|songs?|music) (like|similar to) (this|that|it)\b|^more like this/.test(t)) a = await spotifyMore(text);
    else if (/^(add|save|put) (this|it|the song|this song|this track|the track)( song| track)? (to|in|into) .+/.test(t)) a = await spotifyAdd(text, t.replace(/^.*? (to|in|into) (my )?/, "").replace(/ playlist$/, ""));
    else if (/^(like|love|save|heart) (this|it|this song|the song|this track)( song)?$/.test(t)) a = await spotifyAdd(text, "liked");
    else if (/^play\s+.+/.test(t) && (settings.spotifyConnected || !/playlist|something|music$/.test(t))) a = await playIntent(text, t);
    else if (/^(stop|end|cancel|finish) (the )?focus/.test(t)) { endFocus(false); return; }
    else if (/\bfocus (mode|session|timer|time|block)\b|^(start |begin )?(a )?focus\b|minutes? (of )?focus\b|^help me focus/.test(t)) a = startFocus(text, t);
    else if (/^(show |open )?(my )?clipboard( history)?$|^what did i (just )?copy/.test(t)) a = clipCard(text);
    else if (/^(good morning|morning|(my |the )?(morning |daily )?briefing|brief me|what('s| is) my day( like)?|how does my day look( like)?)$/.test(t)) a = await briefing(text);
    else if (/^(what('s| is) (on )?(my )?(calendar|agenda|schedule)( today| tomorrow)?|(my |today's )?(calendar|agenda|schedule|meetings)( today| tomorrow)?|what('s| is) next|(my )?next meeting|do i have (any )?meetings.*|when is my next meeting)$/.test(t)) a = agendaCard(text);
    else if (/^((check|show|read|any) )?(my )?(new |unread )?(e-?mails?|inbox|mail)( today)?$|^(do i have )?(any )?(new |unread )(e-?mails?|mail)$/.test(t)) a = await mailCard(text);
    else if (/^(check for |install )?(updates?|update jarvis)$/.test(t)) a = await updateCard(text);
    else if (/weather|temperature|forecast|\brain(ing)?\b/.test(t)) a = await weather(text, t);
    else if (/\btimer\b|^remind me in/.test(t)) a = startTimer(text, t);
    else if (/\b(usd|eur|euro|euros|huf|forint|forints|gbp|pound|pounds|dollar|dollars|chf|jpy|yen)\b.*\b(to|in)\b/.test(t)) a = await currency(text, t);
    else if (/^[\d\s.+\-*/x×()%]+$|% of|percent of|^\d+(\.\d+)? (plus|minus|times|divided by) \d/.test(t)) a = calc(text, t);
    else if (/^(note|write down)\b/.test(t)) a = note(text);
    else if (/^translate\b/.test(t)) a = await translate(text, t);
    else if (/\bshelf\b/.test(t)) a = shelfCard(text);
    else { setS("idle"); return askClaude(text); }
  } catch (e) { a = { icon: "info", kicker: "Hmm", said: text, title: "That didn't work", body: String(e.message || e) }; }
  if (a) show(a); else setS("idle");
}

// ---------------- Claude: live activity while it works, then the answer ----------------
const RUN = { web_search: "Searching the web", web_fetch: "Reading a page", look_at_screen: "Looking at your screen", point_at: "Pointing it out", computer: "Using your PC", run_powershell: "Running a command", open: "Opening", clipboard: "Using the clipboard", media_control: "Controlling media", system_status: "Checking your PC", get_weather: "Checking the weather", set_timer: "Setting a timer", remember: "Remembering", forget: "Forgetting" };
const SPIN = '<svg class="spin" viewBox="0 0 24 24"><circle class="bg" cx="12" cy="12" r="9"/><circle class="fg" cx="12" cy="12" r="9"/></svg>';
let approval = null;
const pendingApproval = () => !!approval;
async function askClaude(text, label) {
  if (task && task.status !== "done") return show({ icon: "claude", kicker: "Claude", title: "Still working on the last one", body: "Click the island to see progress, or cancel it there." });
  const what = (label || text).charAt(0).toUpperCase() + (label || text).slice(1);
  task = { said: label || text, what: what.length > 70 ? what.slice(0, 68) + "…" : what, steps: [{ label: "Thinking", done: false }], status: "working", start: Date.now(), out: "", error: null };
  cardOpen = false; renderTaskRow();
  clearInterval(task.int); task.int = setInterval(renderTaskRow, 1000);
  await J.send(text, false);
  finishTask();
}
function pushStep(t, label, name) {
  const cur = t.steps[t.steps.length - 1];
  if (cur && cur.label === label && !cur.done) return;
  if (cur) cur.done = true;
  t.steps.push({ label, name, done: false });
}
function addStep(label, name) {
  if (!task) return;
  pushStep(task, label, name);
  renderTaskRow(); if ($("card").dataset.task === "1") renderTaskCard();
}
const fileName = (p) => String(p || "").split(/[\\/]/).filter(Boolean).pop() || "";
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return String(u || "").slice(0, 40); } };
const clip = (x, n = 48) => { x = String(x || "").replace(/\s+/g, " ").trim(); return x.length > n ? x.slice(0, n - 1) + "…" : x; };
// one readable line per step, for Jarvis's tools and for Claude Code's tools
function stepLabel(name, i = {}) {
  switch (name) {
    case "open": return /^(https?|mailto|spotify):/i.test(i.target || "") ? `Opening ${hostOf(i.target)}` : `Opening ${clip(cap(fileName(i.target) || i.target || "it"), 40)}`;
    case "run_powershell": return clip(i.reason || "Running a command");
    case "web_search": case "WebSearch": return i.query ? `Searching “${clip(i.query, 40)}”` : "Searching the web";
    case "web_fetch": case "WebFetch": return i.url ? `Reading ${hostOf(i.url)}` : "Reading a page";
    case "computer": return { click: "Clicking", double_click: "Double-clicking", right_click: "Right-clicking", type: `Typing “${clip(i.text, 30)}”`, key: `Pressing ${i.keys || "a key"}`, scroll: "Scrolling", drag: "Dragging", move: "Moving the mouse", wait: "Waiting" }[i.action] || "Using your PC";
    case "point_at": return `Pointing: ${clip(i.label || "here", 40)}`;
    case "media_control": return { play_pause: "Play / pause", next: "Next track", previous: "Previous track", volume_up: "Volume up", volume_down: "Volume down", mute: "Mute" }[i.action] || "Controlling media";
    case "clipboard": return i.action === "write" ? "Copying to the clipboard" : "Reading the clipboard";
    case "set_timer": return `Setting a ${clip(i.label || "", 24)} timer`.replace("a  timer", "a timer");
    case "remember": return `Remembering “${clip(i.note, 36)}”`;
    case "get_weather": return `Checking the weather in ${i.city || "your city"}`;
    // Claude Code's own tools
    case "Bash": case "PowerShell": return clip(i.description || i.command || "Running a command");
    case "Edit": case "MultiEdit": return `Editing ${fileName(i.file_path)}`;
    case "Write": return `Writing ${fileName(i.file_path)}`;
    case "Read": return `Reading ${fileName(i.file_path)}`;
    case "NotebookEdit": return `Editing ${fileName(i.notebook_path)}`;
    case "Grep": return `Searching for “${clip(i.pattern, 32)}”`;
    case "Glob": return `Finding ${clip(i.pattern, 32)}`;
    case "Task": case "Agent": return `Subagent: ${clip(i.description || "working", 36)}`;
    case "TodoWrite": case "TaskCreate": case "TaskUpdate": return "Updating the plan";
    case "AskUserQuestion": return "Asking you a question";
    default:
      if (/^mcp__/.test(name || "")) return `Using ${String(name).split("__").pop().replace(/_/g, " ")}`;
      return RUN[name] || name || "Working";
  }
}
J.onAgent((ev) => {
  if (!task) return;
  switch (ev.type) {
    case "text": task.out += ev.text; if (!/Writing/.test(task.steps.at(-1).label)) addStep("Writing the answer"); break;
    case "tool":
      if (ev.status === "running") addStep(ev.detail || RUN[ev.name] || "Working", ev.name);
      else if (ev.status === "detail") {                     // full input arrived: make the step specific
        const st = [...task.steps].reverse().find((x) => x.name === ev.name && !x.done);
        if (st) st.label = stepLabel(ev.name, ev.input); else addStep(stepLabel(ev.name, ev.input), ev.name);
        renderTaskRow(); if ($("card").dataset.task === "1") renderTaskCard();
      } else if (ev.status === "done" || ev.status === "error") {
        const st = [...task.steps].reverse().find((x) => x.name === ev.name && !x.done);
        if (st) st.done = true;
        if ($("card").dataset.task === "1") renderTaskCard();
      }
      break;
    case "action": if (ev.name === "set_timer") startTimer("", `${ev.input.seconds} second timer`, ev.input.label); break;
    case "control": task.control = ev.on; renderTaskRow(); break;
    case "approval":
      approval = { id: ev.id, kind: ev.kind, command: ev.command, reason: ev.reason };
      task.status = "approval"; taskPinned = true; J.focusIsland();
      renderTaskRow(); renderTaskCard();
      notifs.unshift({ app: "claude", from: "Claude · Needs your OK", msg: ev.kind === "control" ? "Use your mouse and keyboard" : ev.reason || "Run a command", at: Date.now() }); // listed, not dropped in: the card is already open
      break;
    case "error":
      task.error = ev;
      if (ev.code === "SETUP") J.openPanel("setup");
      break;
  }
});
function answerApproval(ok) {
  if (!approval) return;
  J.approve(approval.id, ok); approval = null;
  task.status = "working"; taskPinned = false; $("card").dataset.task = "";
  addStep(ok ? "Approved" : "Declined");
}
function renderTaskRow() {
  if (!task) return;
  const secs = Math.floor((Date.now() - task.start) / 1000);
  const lead = task.status === "done" ? '<span class="badge ok">✓</span>' : task.status === "approval" ? '<span class="badge wait">!</span>' : SPIN;
  const label = task.status === "done" ? "Ready" : task.status === "approval" ? "Needs your OK" : task.control ? "Using your PC · Esc to stop" : task.steps.at(-1).label;
  $("taskRow").innerHTML = `${lead}<span class="who">Claude</span><span class="what">${esc(label)}</span><span class="step">${task.status === "working" ? fmt(secs) : ""}</span>`;
}
function renderTaskCard() {
  const t = task; if (!t) return;
  const steps = `<ul class="steps2">${t.steps.map((x, i) => { const st = x.done ? "done" : i === t.steps.length - 1 ? "cur" : ""; return `<li class="${st}"><span class="ic">${st === "done" ? "✓" : SPIN}</span>${esc(x.label)}</li>`; }).join("")}</ul>`;
  const ap = approval && t.status === "approval";
  render({ icon: "claude", kicker: ap ? "Claude needs your OK" : "Claude is working", said: t.said, title: ap ? (approval.kind === "control" ? "Use your mouse and keyboard for this?" : approval.reason || "Run this on your PC?") : t.what,
    html: ap ? (approval.kind === "control" ? `<div class="body">Jarvis's cursor will move on its own. Press Esc any time to stop it.</div>` : `<div class="warn" style="color:var(--fg2);background:var(--tile)"><span style="font-family:Consolas,monospace;font-size:12px;word-break:break-all">${esc(approval.command)}</span></div>`) : steps,
    chips: ap ? [{ label: approval.kind === "control" ? "Allow" : "Run it", run: () => answerApproval(true) }, { label: "Don't", run: () => answerApproval(false) }] : [{ label: "Cancel", run: () => { J.stop(); } }] });
  $("card").dataset.task = "1";
}
function finishTask() {
  const t = task; if (!t) return;
  clearInterval(t.int); approval = null; taskPinned = false;
  if (t.error && !t.out.trim()) {
    task = null;
    return show({ icon: "info", kicker: "Couldn't finish", said: t.said, title: t.error.message || "Something went wrong", body: t.error.code === "SETUP" ? "Finish setup, then ask again." : "" });
  }
  t.status = "done"; renderTaskRow(); flashTask = performance.now() + 1600;
  const took = fmt(Math.floor((Date.now() - t.start) / 1000));
  const answer = { icon: "claude", kicker: `Claude · ${took}`, said: t.said, html: `<div class="body md">${md(t.out || "Done.")}</div>`, stay: true };
  if (document.hasFocus() || hover) setTimeout(() => { task = null; show(answer); }, 1500);
  else { notify({ app: "claude", from: "Claude · Ready", msg: (t.out || "Done").split("\n")[0], answer }, true); setTimeout(() => { task = null; }, 1600); }
}

// ---------------- your Claude Code sessions (Claude app, terminal, VS Code) ----------------
function activeExt() {
  let best = null;
  for (const e of ext.values()) if (e.status === "working" || e.status === "approval") if (!best || e.status === "approval" || e.updated > best.updated && best.status !== "approval") best = e;
  return best;
}
J.onCcEvent((e) => {
  let x = ext.get(e.session);
  const now = Date.now();
  if (e.event === "SessionEnd") { ext.delete(e.session); return; }
  if (e.event === "UserPromptSubmit") {
    x = { id: e.session, project: e.project, prompt: e.prompt || "", steps: [{ label: "Thinking", done: false }], status: "working", start: now, updated: now, tokens0: e.tokens || 0, tokens: e.tokens || 0, model: e.model };
    ext.set(e.session, x); return;
  }
  if (!x) {                                     // joined mid-task (Jarvis started after the prompt)
    if (!["PreToolUse", "PostToolUse", "Notification"].includes(e.event)) return;
    x = { id: e.session, project: e.project, prompt: "", steps: [], status: "working", start: now, updated: now, tokens0: e.tokens || 0, tokens: e.tokens || 0 };
    ext.set(e.session, x);
  }
  x.updated = now;
  if (e.tokens != null) x.tokens = e.tokens;
  if (e.model) x.model = e.model;
  if (e.event === "PreToolUse") { if (x.status === "approval") x.status = "working"; pushStep(x, stepLabel(e.tool, e.input || {}), e.tool); }
  if (e.event === "PostToolUse") { x.status = "working"; const st = [...x.steps].reverse().find((s) => s.name === e.tool && !s.done); if (st) st.done = true; }
  if (e.event === "Notification") {
    if (/permission|approve|allow|confirm/i.test(e.message || "") || e.kind === "permission_prompt") {
      x.status = "approval"; x.message = e.message;
      if (!x.perm) notify({ app: "claude", urgent: true, from: `Claude · ${x.project}`, msg: e.message || "Needs your permission" });
    }
  }
  if (e.event === "Stop") {
    x.status = "done"; x.steps.forEach((s) => (s.done = true));
    extDone = x; extFlash = performance.now() + 2200; rowHtml = "";
    const took = fmt(Math.floor((now - x.start) / 1000)) + (turnTokens(x) ? ` · ${kTok(turnTokens(x))} tokens` : "");
    try { const log = JSON.parse(localStorage.getItem("jarvis-cc-log") || "[]"); log.unshift({ project: x.project, prompt: x.prompt, last: (e.last || "Done").split("\n")[0].slice(0, 160), at: now }); localStorage.setItem("jarvis-cc-log", JSON.stringify(log.slice(0, 30))); } catch {}
    notify({ app: "claude", from: `Claude finished · ${x.project}`, msg: (e.last || "Done").split("\n")[0], full: e.last || "Done",
      answer: { icon: "claude", kicker: `Claude Code · ${x.project} · ${took}`, said: x.prompt, html: `<div class="body md">${md(e.last || "Done.")}</div>`, stay: true } });
    setTimeout(() => { if (ext.get(x.id) === x && x.status === "done") ext.delete(x.id); }, 3000);
    if (extPinned) { extPinned = false; $("card").dataset.task = ""; }
  }
  if (extPinned && $("card").dataset.task === "ext") renderExtCard(true);
});
setInterval(() => { const cut = Date.now() - 20 * 60e3; for (const [k, x] of ext) if (x.updated < cut) ext.delete(k); }, 60e3);
function extRowHtml() {
  const x = activeExt() || (performance.now() < extFlash ? extDone : null);
  if (!x) return "";
  const lead = x.status === "done" ? '<span class="badge ok">✓</span>' : x.status === "approval" ? '<span class="badge wait">!</span>' : SPIN;
  const label = x.status === "done" ? "Done" : x.status === "approval" ? "Needs your OK" : (x.steps.at(-1)?.label || "Working");
  const more = [...ext.values()].filter((e) => e.status === "working" || e.status === "approval").length - 1;
  const tok = turnTokens(x) ? ` · ${kTok(turnTokens(x))}` : "";
  return `${lead}<span class="who">${esc(clip(x.project, 18))}</span><span class="what">${esc(label)}</span><span class="step">${more > 0 ? `+${more}` : x.status === "working" ? fmt(Math.floor((Date.now() - x.start) / 1000)) + tok : ""}</span>`;
}
// tokens this request has used so far (Claude Code's own count, from the session transcript)
const turnTokens = (x) => Math.max(0, (x.tokens || 0) - (x.tokens0 || 0));
const kTok = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1000 ? (n / 1000).toFixed(n >= 1e4 ? 0 : 1) + "k" : String(n);
function renderExtCard(force) {
  const x = activeExt(); if (!x) return;
  if (!force && $("card").dataset.task === "ext" && $("card").dataset.ext === x.id + x.steps.length + x.status + (x.perm?.id || "") + kTok(turnTokens(x))) return;
  const steps = `<ul class="steps2">${x.steps.slice(-6).map((s, i, a) => { const st = s.done ? "done" : i === a.length - 1 ? "cur" : ""; return `<li class="${st}"><span class="ic">${st === "done" ? "✓" : SPIN}</span>${esc(s.label)}</li>`; }).join("")}</ul>`;
  if (x.status === "approval" && x.perm) {
    const p = x.perm;
    render({ icon: "claude", kicker: `Claude Code · ${x.project}`, said: x.prompt, title: permTitle(p), html: permDetail(p),
      chips: [{ label: "Allow", run: () => answerExtPerm(p, "allow") }, { label: "Deny", run: () => answerExtPerm(p, "deny") }, { label: "Answer in Claude", run: () => answerExtPerm(p, "ask") }],
      note: `Claude Code is waiting. If you don't answer here within ${Math.round((p.holdS || 110) / 60)} minutes, it asks in its own window.` });
    $("card").dataset.task = "ext"; $("card").dataset.ext = x.id + x.steps.length + x.status + p.id;
    return;
  }
  const meta = `${fmt(Math.floor((Date.now() - x.start) / 1000))}${turnTokens(x) ? ` · ${kTok(turnTokens(x))} tokens` : ""}${x.model ? ` · ${String(x.model).replace(/^claude-/, "").replace(/-\d.*$/, "").replace(/^\w/, (c) => c.toUpperCase())}` : ""}`;
  render({ icon: "claude", kicker: `Claude Code · ${x.project}`, said: x.prompt, title: x.status === "approval" ? "Needs your OK" : `Working · ${meta}`,
    html: x.status === "approval" ? `<div class="body">${esc(x.message || "Claude is waiting for your permission.")}</div><div class="note">Answer it in Claude Code.</div>` : steps });
  $("card").dataset.task = "ext"; $("card").dataset.ext = x.id + x.steps.length + x.status + kTok(turnTokens(x));
}
// ---- Allow / Deny for Claude Code's permission requests (PermissionRequest hook)
function permTitle(p) {
  const i = p.input || {}, t = p.tool || "";
  if (t === "Bash" || t === "PowerShell") return clip(i.description ? `${i.description}?` : "Run this command?", 70);
  if (t === "Edit" || t === "MultiEdit" || t === "NotebookEdit") return `Edit ${fileName(i.file_path || i.notebook_path)}?`;
  if (t === "Write") return `Write ${fileName(i.file_path)}?`;
  if (t === "WebFetch") return `Open ${hostOf(i.url)}?`;
  if (t === "WebSearch") return `Search the web for “${clip(i.query, 40)}”?`;
  if (/^mcp__/.test(t)) return `Use ${t.split("__").pop().replace(/_/g, " ")}?`;
  return `Use ${t || "a tool"}?`;
}
function permDetail(p) {
  const i = p.input || {}, t = p.tool || "";
  const mono = (x) => `<div class="warn" style="color:var(--fg2);background:var(--tile)"><span style="font-family:Consolas,monospace;font-size:12px;word-break:break-all;white-space:pre-wrap;max-height:120px;overflow:hidden;display:block">${esc(String(x).slice(0, 600))}</span></div>`;
  if (t === "Bash" || t === "PowerShell") return mono(i.command || "");
  if (i.file_path || i.notebook_path) return mono(i.file_path || i.notebook_path);
  if (i.url) return mono(i.url);
  const j = JSON.stringify(i); return j && j !== "{}" ? mono(j) : "";
}
function answerExtPerm(p, decision) {
  J.answerPerm(p.id, decision); perms.delete(p.id);
  const x = ext.get(p.session);
  if (x && x.perm?.id === p.id) { x.perm = null; x.status = decision === "ask" ? "approval" : "working"; if (decision === "ask") x.message = "Answer it in Claude Code's window."; }
  extPinned = false; $("card").dataset.task = ""; cardOpen = false;
}
J.onCcPerm((p) => {
  perms.set(p.id, p);
  let x = ext.get(p.session);
  if (!x) { x = { id: p.session, project: p.project, prompt: "", steps: [], status: "working", start: Date.now(), updated: Date.now() }; ext.set(p.session, x); }
  x.status = "approval"; x.perm = p; x.updated = Date.now();
  extPinned = true; cardOpen = false;
  if (!task) renderExtCard(true);
  notifs.unshift({ app: "claude", from: `Claude · ${p.project} needs your OK`, msg: permTitle(p), at: Date.now() });   // listed; the card is already open
  $("live").textContent = `Claude Code in ${p.project} asks: ${permTitle(p)}`;
});
J.onCcPermDone(({ id, decision }) => {
  const p = perms.get(id); if (!p) return;
  perms.delete(id);
  const x = ext.get(p.session);
  if (x && x.perm?.id === id) { x.perm = null; x.status = decision === "ask" ? "approval" : "working"; if (decision === "ask") x.message = "Answer it in Claude Code's window."; }
  if (extPinned) { extPinned = false; $("card").dataset.task = ""; }
});

// ---------------- music: real "now playing" from Windows ----------------
const ART = ["linear-gradient(135deg,#ff2d55,#5856d6)", "linear-gradient(135deg,#ff9f0a,#ff375f)", "linear-gradient(135deg,#30d158,#0a84ff)", "linear-gradient(135deg,#bf5af2,#5e5ce6)", "linear-gradient(135deg,#64d2ff,#5856d6)"];
const artFor = (s) => ART[[...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % ART.length];
const coverCss = (dataUrl) => `url('${dataUrl}') center / cover no-repeat`;   // single quotes: it goes inside a style="…" attribute
let coverKey = "", cover = "";
// Browsers report every video (YouTube, Netflix…) as "media", so by default only music apps show the
// player. Turn on "Show music playing in the browser" in Settings for YouTube Music, SoundCloud…
const BROWSER = /chrome|msedge|edge|firefox|opera|brave|vivaldi|arc\b|browser/i;
J.onMedia((m) => {
  if (!m || !m.title || (BROWSER.test(m.app || "") && !settings.browserMedia)) { music = null; return; }
  const same = music && music.title === m.title;
  if (m.key !== coverKey) { coverKey = m.key; cover = ""; }
  if (m.art) cover = coverCss(m.art);
  music = { title: m.title, artist: m.artist || appName(m.app), playing: !!m.playing, pos: m.pos || 0, dur: m.dur || 0, at: performance.now(), art: cover || artFor(m.title + m.artist) };
  if (m.artist) loadLyrics(m.title, m.artist, m.dur);
  if (same && $("card").dataset.np === "1") { const c = $("card").querySelector(".cover"); if (c) c.style.setProperty("--art", music.art); }
  if (!same && $("card").dataset.np === "1" && cardOpen) render(nowPlaying());
});
const appName = (id) => /spotify/i.test(id) ? "Spotify" : /chrome|msedge|firefox/i.test(id) ? "Browser" : "Media";
function musicPos() { return music ? Math.min(music.dur || 0, music.pos + (music.playing ? (performance.now() - music.at) / 1000 : 0)) : 0; }
function drawMusic() {
  const pos = musicPos(), frac = music.dur ? pos / music.dur : 0;
  $("mMini").style.width = frac * 100 + "%";
  $("mArt").style.setProperty("--art", music.art);
  $("lMusic").classList.toggle("paused", !music.playing);
  const p = $("mProg"); if (p) p.style.width = frac * 100 + "%";
  const t = $("mPos"); if (t) t.textContent = fmt(pos);
  const ic = $("mPlayIcon"); if (ic) ic.innerHTML = music.playing ? '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>' : '<path d="M7 4v16l13-8z"/>';
  const l = lyricNow(pos);
  const lm = $("mLyrMini"); if (lm && lm.textContent !== (l?.cur || "")) lm.textContent = l?.cur || "";
  const ly = $("mLyr");
  if (ly) { ly.hidden = !l; if (l && ly.dataset.i !== String(l.i)) { ly.dataset.i = l.i; ly.innerHTML = `<p class="cur">${esc(l.cur || "♪")}</p><p class="nxt">${esc(l.next)}</p>`; } }
}
// synced lyrics (LRCLIB) for whatever is playing
let lyrKey = "";
function loadLyrics(title, artist, dur) {
  const k = title + "|" + artist;
  if (k === lyrKey) return;
  lyrKey = k; lyrics = null;
  J.lyrics({ title, artist, duration: dur }).then((l) => { if (lyrKey === k) lyrics = l; }).catch(() => {});
}
function lyricNow(pos = musicPos()) {
  if (!lyrics || !music) return null;
  let i = -1;
  for (let j = 0; j < lyrics.length; j++) { if (lyrics[j].t <= pos + 0.25) i = j; else break; }
  if (i < 0 && pos < (lyrics[0]?.t || 0) - 1) return null;
  return { i, cur: i >= 0 ? lyrics[i].line : "", next: lyrics[i + 1]?.line || "" };
}
const CTRL = { prev: '<path d="M6 5h2v14H6zM20 5v14L9 12z"/>', next: '<path d="M16 5h2v14h-2zM4 5v14l11-7z"/>' };
function nowPlaying() {
  const m = music;
  if (!m) return { icon: "music", kicker: "Music", title: "Nothing is playing", body: "Start something in Spotify or your browser and it shows up here." };
  return { bare: true, stay: true,
    html: `<div class="player"><div class="cover${m.art.startsWith("url(") ? " photo" : ""}" style="--art:${m.art}"></div><div class="side">
        <div class="t">${esc(m.title)}</div><div class="a">${esc(m.artist)}</div>
        <div class="ctrls"><button id="mPrev" aria-label="Previous"><svg viewBox="0 0 24 24">${CTRL.prev}</svg></button><button id="mPlay" aria-label="Play or pause"><svg viewBox="0 0 24 24" id="mPlayIcon"></svg></button><button id="mNext" aria-label="Next"><svg viewBox="0 0 24 24">${CTRL.next}</svg></button></div>
        <div class="prog"><i id="mProg"></i></div><div class="times"><span id="mPos">0:00</span><span>${m.dur ? fmt(m.dur) : ""}</span></div>
      </div></div><div class="lyr" id="mLyr" hidden></div>`,
    after: () => {
      $("card").dataset.np = "1";
      $("mPlay").onclick = () => { J.mediaKey("play_pause"); if (music) { music.pos = musicPos(); music.at = performance.now(); music.playing = !music.playing; } };
      $("mNext").onclick = () => J.mediaKey("next"); $("mPrev").onclick = () => J.mediaKey("previous");
      drawMusic();
    } };
}
function media(said, what) { setTimeout(() => { if (music) show(nowPlaying()); }, 900); return { icon: "music", kicker: "Music", said, title: what }; }
// ---- Spotify: real playback once connected (Settings → Connect Spotify); otherwise opens the search
function spotifyCard(said, r, extra = {}) {
  return { icon: "music", kicker: "Spotify", said, ...extra,
    html: `<div class="np"><div class="cover${r.art ? " photo" : ""}" style="--art:${r.art ? coverCss(r.art) : artFor(r.title || "")}"></div><div class="meta"><b>${esc(r.title || "")}</b><span>${esc(r.artist || "")}</span></div></div>` };
}
const notConnected = (said) => ({ icon: "music", kicker: "Spotify", said, title: "Spotify isn't connected", body: "Right-click the island → Settings → Connect Spotify, and I can play, like and add songs for you.", chips: [{ label: "Open Settings", run: () => J.openPanel("settings") }] });
async function playIntent(said, t) {
  const q = t.replace(/^play\s+/, "").replace(/\s+on spotify$/, "").trim();
  if (settings.spotifyConnected) {
    const r = await J.spotify("play", q);
    if (r.code === "NO_SPOTIFY") return notConnected(said);
    if (r.error) return { icon: "music", kicker: "Spotify", said, title: "Couldn't play that", body: r.error };
    if (r.notFound) return { icon: "music", kicker: "Spotify", said, title: `Nothing on Spotify matched “${q}”` };
    const card = spotifyCard(said, r, { note: r.fallback === "premium" ? "Opened in Spotify. One-click play needs Premium, so press play there." : r.fallback === "device" ? "Opened in Spotify. Press play there." : "" });
    if (r.ok) setTimeout(() => { if (music && cardOpen && lastAnswer === card) show(nowPlaying()); }, 3000);
    return card;
  }
  J.openExternal("spotify:search:" + encodeURIComponent(q));
  return { icon: "music", kicker: "Music", said, title: `Looking up “${q}” in Spotify`, body: "Spotify opens on the search. Once it plays, it appears here.", note: "Connect Spotify in Settings and I'll start it for you." };
}
async function spotifyAdd(said, playlist) {
  if (!settings.spotifyConnected) return notConnected(said);
  const liked = /^(liked|liked songs|favou?rites?|my library|library)$/.test(playlist);
  const r = await J.spotify(liked ? "like" : "add_to_playlist", liked ? "" : playlist);
  if (r.error) return { icon: "music", kicker: "Spotify", said, title: r.error, body: r.playlists?.length ? `Your playlists: ${r.playlists.join(", ")}` : "" };
  return { icon: "music", kicker: "Spotify", said, title: `Added to ${r.playlist}`, body: `${r.track.title} · ${r.track.artist}` };
}
async function spotifyMore(said) {
  if (!settings.spotifyConnected) return notConnected(said);
  const r = await J.spotify("more_like_this");
  if (r.error) return { icon: "music", kicker: "Spotify", said, title: r.error };
  return { icon: "music", kicker: "Spotify", said, title: `More from ${r.artist}`, body: "Playing their songs on shuffle.", note: r.fallback ? "Opened in Spotify. Press play there." : "" };
}
const VOL = { up: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>', low: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>', mute: '<path d="M11 5 6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6"/>' };
let volume = 0.5;
function volumeIntent(t) {
  const up = /up|louder/.test(t), mute = /mute/.test(t);
  J.mediaKey(mute ? "mute" : up ? "volume_up" : "volume_down");
  volume = mute ? 0 : Math.min(1, Math.max(0, volume + (up ? .08 : -.08)));
  $("hudLvl").style.width = volume * 100 + "%";
  $("hudIcon").innerHTML = volume === 0 ? VOL.mute : volume < .5 ? VOL.low : VOL.up;
  hud = { until: performance.now() + 1400 };
  setS("idle"); return null;
}

// ---------------- quick things done locally ----------------
function timerHTML(text, frac) {
  return `<div class="timerrow"><svg class="ring bigring" viewBox="0 0 24 24"><circle class="bg" cx="12" cy="12" r="9"/><circle class="fg" id="tBigRing" cx="12" cy="12" r="9" stroke-dasharray="56.5" stroke-dashoffset="${(56.5 * frac).toFixed(1)}"/><circle class="head" id="tBigHead" cx="21" cy="12" r="1.4"/></svg><div class="big" id="tBig">${text}</div></div>`;
}
function drawRings(now) {
  if (!timer) return;
  const left = Math.max(0, (timer.end - Date.now()) / (timer.secs * 1000));
  const intro = Math.min(1, (now - timer.t0) / 700), ease = 1 - Math.pow(1 - intro, 3);
  const frac = left * ease, a = 2 * Math.PI * frac;
  for (const [ring, head] of [["tRing", "tHead"], ["bRing", "bHead"], ["tBigRing", "tBigHead"]]) {
    const r = $(ring), h = $(head); if (!r) continue;
    r.style.strokeDashoffset = 56.5 * (1 - frac);
    if (h) { h.setAttribute("cx", (12 + 9 * Math.cos(a)).toFixed(2)); h.setAttribute("cy", (12 + 9 * Math.sin(a)).toFixed(2)); }
  }
}
function startTimer(said, t, label) {
  const n = parseFloat(t.match(/(\d+(\.\d+)?)/)?.[1] || "5"), secs = Math.max(1, Math.round(/second/.test(t) ? n : /hour/.test(t) ? n * 3600 : n * 60));
  if (timer) clearInterval(timer.int);
  timer = { end: Date.now() + secs * 1000, secs, t0: performance.now(), label: label || "Timer" };
  timer.int = setInterval(() => {
    if (!timer) return;
    const left = Math.max(0, Math.ceil((timer.end - Date.now()) / 1000));
    $("tCompact").textContent = fmt(left);
    const big = $("tBig"); if (big) big.textContent = fmt(left);
    if (!left) {
      if (timer.focus) return endFocus(true);
      clearInterval(timer.int); const lbl = timer.label; timer = null;
      J.notify("Jarvis", `${lbl}: time's up`);
      notify({ app: "timer", from: lbl, msg: "Time's up" }, false);
    }
  }, 250);
  $("tCompact").textContent = fmt(secs);
  return { icon: "timer", kicker: timer.label, said, html: timerHTML(fmt(secs), 0), chips: [{ label: "Cancel", run: () => { if (timer?.focus) return endFocus(false); clearInterval(timer?.int); timer = null; cardOpen = false; } }] };
}
// ---- focus mode: a focus timer; notifications wait until it's over (meetings and Claude's questions still come through)
function startFocus(said, t) {
  if (focus) endFocus(false, true);
  const n = parseFloat(t.match(/(\d+(\.\d+)?)/)?.[1] || "25"), mins = Math.max(1, Math.round(/hour/.test(t) ? n * 60 : n));
  const a = startTimer(said, `${mins} minute timer`, "Focus");
  timer.focus = true; focus = { held: [], start: Date.now(), mins };
  return { ...a, icon: "focus", kicker: `Focus · ${mins} min`, note: "I'll hold notifications until you're done. Meetings and Claude's questions still come through." };
}
function endFocus(done, quiet) {
  const f = focus; if (!f) return;
  focus = null;
  if (timer?.focus) { clearInterval(timer.int); timer = null; }
  const held = f.held.slice().reverse();
  notifs = [...held, ...notifs].slice(0, 30);
  if (quiet) return;
  const mins = Math.max(1, Math.round((Date.now() - f.start) / 60000));
  if (done) J.notify("Jarvis", "Focus session done");
  show({ icon: "focus", kicker: done ? "Focus done" : "Focus ended", title: done ? `${f.mins} minutes of focus. Nicely done.` : `You focused for ${mins} min`, stay: true,
    html: `<div class="body">${held.length ? `${held.length} notification${held.length > 1 ? "s" : ""} came in while you focused:` : "Nothing came in while you were focused."}</div>${held.length ? nlistHtml(held.slice(0, 6)) : ""}`,
    after: () => document.querySelectorAll("#card .nlist li").forEach((li) => (li.onclick = () => show(notifDetail(held[+li.dataset.n])))) });
}
function hoursHTML(hrs) {
  const lo = Math.min(...hrs.map((h) => h[1])), hi = Math.max(...hrs.map((h) => h[1]));
  return `<div class="hours">${hrs.map(([h, t], i) => `<div><b>${Math.round(t)}°</b><i style="height:${8 + 34 * ((t - lo) / (hi - lo || 1))}px"></i>${i ? String(h).padStart(2, "0") : "Now"}</div>`).join("")}</div>`;
}
async function weather(said, t) {
  const city = t.match(/\bin ([a-zà-ž .'-]+)/i)?.[1]?.replace(/\b(today|tomorrow|now)\b/g, "").trim() || settings.city || "Budapest";
  const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(city)}`).then((r) => r.json());
  const p = g.results?.[0]; if (!p) return { icon: "weather", kicker: "Weather", said, title: `I couldn't find ${city}` };
  const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,apparent_temperature&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&hourly=temperature_2m&timezone=auto&forecast_days=2`).then((r) => r.json());
  const r = Math.round;
  const nowIdx = Math.max(0, w.hourly.time.findIndex((x) => new Date(x) >= new Date(Date.now() - 3600e3)));
  const hrs = w.hourly.time.slice(nowIdx, nowIdx + 6).map((x, i) => [new Date(x).getHours(), w.hourly.temperature_2m[nowIdx + i]]);
  return { icon: "weather", kicker: `Weather · ${p.name}`, said, html: `<div class="big">${r(w.current.temperature_2m)}°</div><div class="tiles"><div class="tile"><small>Feels like</small><b>${r(w.current.apparent_temperature)}°</b></div><div class="tile"><small>High / low</small><b>${r(w.daily.temperature_2m_max[0])}° / ${r(w.daily.temperature_2m_min[0])}°</b></div><div class="tile"><small>Rain</small><b>${w.daily.precipitation_probability_max[0]}%</b></div></div>${hoursHTML(hrs)}` };
}
async function currency(said, t) {
  const map = { euro: "EUR", euros: "EUR", eur: "EUR", forint: "HUF", forints: "HUF", huf: "HUF", dollar: "USD", dollars: "USD", usd: "USD", pound: "GBP", pounds: "GBP", gbp: "GBP", chf: "CHF", yen: "JPY", jpy: "JPY" };
  const m = t.match(/([\d.,]+)\s*([a-z]+)\s+(?:to|in)\s+([a-z]+)/);
  if (!m || !map[m[2]] || !map[m[3]]) throw new Error("Say it like “100 euro to forint”.");
  const amt = parseFloat(m[1].replace(",", ".")), from = map[m[2]], to = map[m[3]];
  const d = await fetch(`https://api.frankfurter.app/latest?amount=${amt}&from=${from}&to=${to}`).then((r) => r.json());
  const v = d.rates[to];
  return { icon: "calc", kicker: "Currency", said, html: `<div class="big">${v.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${to}</div>`, body: `${amt} ${from} · rate ${(v / amt).toFixed(4)} · ${d.date}` };
}
function calc(said, t) {
  const e = t.replace(/what('s| is)/, "").replace(/(\d+(\.\d+)?)\s*(%|percent) of\s*(\d+(\.\d+)?)/g, "($1/100*$4)")
    .replace(/\bplus\b/g, "+").replace(/\bminus\b/g, "-").replace(/\btimes\b|×|\bx\b/g, "*").replace(/divided by/g, "/").replace(/[?=]/g, "").trim();
  if (!/^[\d\s.+\-*/()]+$/.test(e)) throw new Error("I can do + − × ÷ and percentages.");
  const v = Function(`"use strict";return (${e})`)();
  return { icon: "calc", kicker: "Calculator", said, html: `<div class="big">${(+v.toFixed(6)).toLocaleString()}</div>` };
}
function notes() { try { return JSON.parse(localStorage.getItem("jarvis-notes") || "[]"); } catch { return []; } }
function note(said) {
  const text = said.replace(/^(note|write down)( that)?[:,]?\s*/i, "");
  const all = [{ text, at: Date.now() }, ...notes()].slice(0, 8);
  try { localStorage.setItem("jarvis-notes", JSON.stringify(all)); } catch {}
  return { icon: "note", kicker: "Notes", said, title: "Saved", html: `<ul class="list">${all.map((n) => `<li><span class="k">${new Date(n.at).toLocaleDateString([], { month: "short", day: "numeric" })}</span><span class="v">${esc(n.text)}</span></li>`).join("")}</ul>` };
}
async function translate(said) {
  const m = said.match(/^translate\s+(.+?)\s+(?:to|into)\s+([a-zA-Z]+)\s*[.?!]?$/i);
  if (!m) throw new Error("Say it like “translate good morning to Hungarian”.");
  const LANG = { hungarian: "hu", german: "de", french: "fr", spanish: "es", italian: "it", english: "en", japanese: "ja", portuguese: "pt", dutch: "nl", polish: "pl" };
  const to = LANG[m[2].toLowerCase()] || m[2].slice(0, 2).toLowerCase();
  const d = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(m[1])}&langpair=en|${to}`).then((r) => r.json());
  return { icon: "web", kicker: `Translate → ${cap(m[2])}`, said, title: d.responseData.translatedText, body: m[1], chips: [{ label: "Copy", run: () => navigator.clipboard.writeText(d.responseData.translatedText).catch(() => {}) }] };
}

// ---------------- shelf: drag real files onto the island; click to open ----------------
const size = (b) => b > 1e9 ? (b / 1e9).toFixed(1) + " GB" : b > 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1e3)) + " KB";
function shelfCard(said = "") {
  return { icon: "pc", kicker: "Shelf", said, title: shelf.length ? `${shelf.length} item${shelf.length > 1 ? "s" : ""} on the shelf` : "Shelf is empty",
    html: shelf.length ? `<ul class="list">${shelf.map((f, i) => `<li class="play" data-f="${i}"><span class="k">${f.size}</span><span class="v">${esc(f.name)}</span></li>`).join("")}</ul>` : "",
    body: shelf.length ? "" : "Drag files onto the island to keep them here.",
    chips: shelf.length ? [{ label: "Clear", run: () => { shelf = []; show(shelfCard()); } }] : [], stay: true,
    after: () => document.querySelectorAll("#card li[data-f]").forEach((li) => (li.onclick = async () => { const err = await J.openPath(shelf[+li.dataset.f].path); if (err) show({ icon: "pc", kicker: "Shelf", title: "Couldn't open it", body: err }); })) };
}
addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { e.preventDefault(); dragOver = true; cardOpen = false; setInteractive(true); } });
addEventListener("dragleave", (e) => { if (!e.relatedTarget) dragOver = false; });
addEventListener("drop", (e) => {
  e.preventDefault(); dragOver = false;
  for (const f of e.dataTransfer.files) shelf.unshift({ name: f.name, size: size(f.size), path: J.filePath(f) });
  shelf = shelf.slice(0, 10);
  show(shelfCard());
});

// ---------------- notifications from Jarvis (Claude finished, timers, …) ----------------
const APPS = {
  claude: { bg: "#d97757", name: "Claude", icon: ICON.claude },
  timer: { bg: "#ff9f0a", name: "Timer", icon: ICON.timer },
  jarvis: { bg: "#0a84ff", name: "Jarvis", icon: ICON.info },
  calendar: { bg: "#ff3b30", name: "Calendar", icon: ICON.cal },
  mail: { bg: "#0a84ff", name: "Mail", icon: ICON.mail },
  download: { bg: "#30d158", name: "Downloads", icon: ICON.down },
  update: { bg: "#5e5ce6", name: "Jarvis", icon: ICON.update },
  clip: { bg: "#636366", name: "Clipboard", icon: ICON.clip },
};
// other apps (WhatsApp, Discord…) get a coloured badge with their initial
const appBadge = (n) => { const a = APPS[n.app]; return a ? `<span class="app" style="background:${a.bg}"><svg viewBox="0 0 24 24">${a.icon}</svg></span>` : `<span class="app letter" style="background:${esc(n.color || "#636366")}">${esc((n.appName || "?").charAt(0).toUpperCase())}</span>`; };
const appLabel = (n) => n.appName || (APPS[n.app] || APPS.jarvis).name;
function notify(n, count = true) {
  n = { ...n, at: Date.now() };
  if (focus && !n.urgent) { if (!n.transient) focus.held.push(n); return; }   // focus mode: hold it for the summary
  if (!n.transient) { notifs.unshift(n); notifs = notifs.slice(0, 30); if (count) unread++; }
  suggestion = n.transient ? n : null;
  $("notifRow").innerHTML = `${appBadge(n)}<span class="txt"><div class="from">${esc(n.from)}</div><div class="msg">${esc(n.msg)}</div></span><span class="when">${n.transient ? "" : "now"}</span>`;
  notifShow = performance.now() + (n.transient ? 6500 : 4200);
  $("live").textContent = `${n.from}: ${n.msg}`;
}
function notifDetail(n) {
  if (n.answer) return n.answer;
  const ago = Math.floor((Date.now() - n.at) / 60000);
  return { icon: "info", kicker: `${appLabel(n)} · ${ago < 1 ? "now" : ago + "m ago"}`, stay: true,
    html: `<div class="nfull">${appBadge(n)}<div style="flex:1;min-width:0"><div class="from">${esc(n.from)}</div><div class="msg">${esc(n.full || n.msg)}</div></div></div>`,
    chips: [...(n.chips || []), { label: "Dismiss", run: () => { notifs = notifs.filter((x) => x !== n); cardOpen = false; } }] };
}
const agoShort = (t) => { const m = Math.floor((Date.now() - t) / 60000); return m < 1 ? "now" : m < 60 ? m + "m" : Math.floor(m / 60) + "h"; };
function nlistHtml(list) {
  return `<ul class="nlist">${list.map((n, i) => `<li data-n="${i}">${appBadge(n)}<span class="txt"><div style="font-size:13.5px;font-weight:600;color:var(--fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(n.from)}</div><div style="font-size:13px;color:var(--fg2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(n.msg)}</div></span><span style="font-size:12px;color:var(--muted)">${agoShort(n.at)}</span></li>`).join("")}</ul>`;
}
function notifCenter() {
  return { icon: "info", kicker: "Notifications", title: notifs.length ? `${notifs.length} notification${notifs.length > 1 ? "s" : ""}` : "You're all caught up",
    html: notifs.length ? nlistHtml(notifs) : "",
    chips: notifs.length ? [{ label: "Clear all", run: () => { notifs = []; cardOpen = false; } }] : [], stay: true,
    after: () => document.querySelectorAll("#card .nlist li").forEach((li) => (li.onclick = () => show(notifDetail(notifs[+li.dataset.n])))) };
}

// ---------------- small helpers for live rows ----------------
function setRow(id, html) { const el = $(id); if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; } }
const hm = (iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const svgI = (k) => `<svg viewBox="0 0 24 24">${ICON[k]}</svg>`;

// ---------------- other apps' notifications (WhatsApp, Discord, Outlook…) ----------------
J.onToast((t) => {
  if (settings.otherNotifications === false) return;
  const urgent = /incoming call|is calling|calling you|missed call/i.test(t.title + " " + t.body);
  notify({ app: "other", appName: t.appName, color: t.color, from: t.title || t.appName, msg: t.body || t.appName, full: t.body, urgent });
});

// ---------------- clipboard history + "copied an error" suggestion ----------------
try { clips = JSON.parse(localStorage.getItem("jarvis-clips-pinned") || "[]").map((c) => ({ ...c, pinned: true })); } catch { clips = []; }
const saveClips = () => { try { localStorage.setItem("jarvis-clips-pinned", JSON.stringify(clips.filter((c) => c.pinned))); } catch {} };
const looksLikeError = (t) => t.length < 8000 && /\b[A-Z]\w*(Error|Exception)\b|Traceback \(most recent call last\)|^\s*at .+[:(]\d+|\bERR_[A-Z_]{3,}|^\s*(error|fatal|panic)(\[\w+\])?:|npm ERR!|exit(ed)? (with )?code [1-9]|segmentation fault|command not found|is not recognized as/im.test(t);
J.onClip((c) => {
  if (settings.clipboardHistory !== false && !clips.some((x) => x.pinned && x.text === c.text)) {
    clips = [{ text: c.text, at: c.at }, ...clips.filter((x) => x.text !== c.text)];
    let n = 0; clips = clips.filter((x) => x.pinned || ++n <= 20);
    if ($("card").dataset.clips === "1" && cardOpen) render(clipCard());
  }
  if (settings.smartSuggestions !== false && looksLikeError(c.text) && s === "idle" && !task)
    notify({ transient: true, app: "claude", from: "Copied an error", msg: "Click and Claude explains how to fix it", run: () => askClaude(`I copied this error. Explain in plain words what went wrong and how to fix it:\n\n${c.text.slice(0, 4000)}`, "Explain the error I copied") });
});
function clipCard(said = "") {
  const list = [...clips.filter((c) => c.pinned), ...clips.filter((c) => !c.pinned)];
  const lang = settings.language && settings.language !== "auto" ? settings.language : "";
  return { icon: "clip", kicker: "Clipboard", said, title: list.length ? `Last ${list.length} copied` : "Nothing copied yet", stay: true,
    body: list.length ? "" : "Copy some text and it shows up here. Pin the ones you want to keep.",
    html: list.length ? `<ul class="list clips">${list.map((c, i) => `<li class="play${c.pinned ? " pinned" : ""}" data-c="${i}"><span class="k">${c.pinned ? "Pinned" : agoShort(c.at)}</span><span class="v">${esc(clip(c.text, 90))}</span><span class="acts"><button data-a="pin">${c.pinned ? "Unpin" : "Pin"}</button><button data-a="ex">Explain</button><button data-a="tr">Translate</button></span></li>`).join("")}</ul>` : "",
    chips: list.some((c) => !c.pinned) ? [{ label: "Clear unpinned", run: () => { clips = clips.filter((c) => c.pinned); render(clipCard()); } }] : [],
    after: () => {
      $("card").dataset.clips = "1";
      document.querySelectorAll("#card .clips li").forEach((li) => (li.onclick = (e) => {
        const c = list[+li.dataset.c]; if (!c) return;
        const act = e.target.closest("button")?.dataset.a;
        if (act === "pin") { c.pinned = !c.pinned; if (!c.pinned) c.at = Date.now(); saveClips(); render(clipCard()); return; }
        if (act === "ex") { cardOpen = false; return askClaude(`Explain this in plain words:\n\n${c.text.slice(0, 4000)}`, "Explain what I copied"); }
        if (act === "tr") { cardOpen = false; return askClaude(`Translate this${lang ? ` into ${lang}` : " into English (if it's already English, into the language I usually speak)"}. Reply with just the translation:\n\n${c.text.slice(0, 4000)}`, "Translate what I copied"); }
        J.clipWrite(c.text);
        li.querySelector(".k").textContent = "Copied ✓";
        setTimeout(() => { cardOpen = false; }, 700);
      }));
    } };
}

// ---------------- downloads: live progress, then Open / Show in folder ----------------
J.onDownload((d) => { if (settings.downloads !== false) dls.set(d.id, { ...d, seen: Date.now() }); });
J.onDownloadDone((d) => {
  dls.delete(d.id);
  if (d.cancelled || settings.downloads === false) return;
  const open = async () => { const err = await J.openPath(d.path); if (err) show({ icon: "down", kicker: "Downloads", title: "Couldn't open it", body: err }); else cardOpen = false; };
  notify({ app: "download", from: "Downloaded", msg: d.name, full: `${d.name} · ${size(d.size || 0)}`,
    chips: settings.smartSuggestions === false ? [] : [{ label: "Open", run: open }, { label: "Show in folder", run: () => { J.showInFolder(d.path); cardOpen = false; } }] });
});
function activeDl() {
  const now = Date.now(); let best = null;
  for (const [k, x] of dls) { if (now - x.seen > 5000) { dls.delete(k); continue; } if (!best || x.seen > best.seen) best = x; }
  return best;
}
const rate = (b) => b > 1e6 ? (b / 1e6).toFixed(1) + " MB/s" : Math.max(1, Math.round(b / 1e3)) + " KB/s";
function dlRowHtml() {
  const d = activeDl(); if (!d) return "";
  const more = dls.size - 1;
  return `<span class="rowic dl">${svgI("down")}</span><span class="who">${esc(clip(d.name, 24))}</span><span class="what">${size(d.size)}${d.speed > 500 ? " · " + rate(d.speed) : ""}</span><span class="step">${more > 0 ? "+" + more : ""}</span><i class="dlbar"></i>`;
}
function downloadsCard() {
  const list = [...dls.values()];
  return { icon: "down", kicker: "Downloads", title: list.length ? `Downloading ${list.length} file${list.length > 1 ? "s" : ""}` : "No downloads right now", stay: true,
    html: list.length ? `<ul class="list">${list.map((d) => `<li><span class="k">${size(d.size)}</span><span class="v">${esc(d.name)}</span><span class="k" style="min-width:0">${d.speed > 500 ? rate(d.speed) : ""}</span></li>`).join("")}</ul>` : "",
    note: "Browsers don't share the total size with other apps, so this shows how much has arrived." };
}

// ---------------- calendar: next meeting live activity with Join ----------------
J.onCalendar((r) => { cal = r?.events || []; });
function meetingSoon(now = Date.now()) {
  return cal.find((e) => !e.allDay && Date.parse(e.start) - now < 10 * 60e3 && now < Math.min(Date.parse(e.end), Date.parse(e.start) + 10 * 60e3));
}
function meetRowHtml(e) {
  if (!e) return "";
  const d = Math.ceil((Date.parse(e.start) - Date.now()) / 60000);
  return `<span class="rowic cal">${svgI("cal")}</span><span class="who">${esc(clip(e.title, 26))}</span><span class="what">${d > 0 ? `in ${d} min` : "now"}</span>${e.join ? `<button class="join" data-join="${esc(e.join)}">Join</button>` : `<span class="step">${hm(e.start)}</span>`}`;
}
$("meetRow").addEventListener("click", (ev) => { const b = ev.target.closest("[data-join]"); if (b) { ev.stopPropagation(); J.openExternal(b.dataset.join); } });
const reminded = new Set();
setInterval(() => {   // heads-up five minutes before
  const now = Date.now();
  for (const e of cal) {
    const d = Date.parse(e.start) - now, k = e.title + e.start;
    if (e.allDay || d <= 0 || d > 5 * 60e3 || reminded.has(k)) continue;
    reminded.add(k);
    J.notify(e.title, `Starts at ${hm(e.start)}`);
    notify({ app: "calendar", urgent: true, from: e.title, msg: `Starts at ${hm(e.start)}${e.location ? " · " + e.location : ""}`, chips: e.join ? [{ label: "Join", run: () => { J.openExternal(e.join); cardOpen = false; } }] : [] });
  }
}, 20e3);
function agendaRows(list) {
  const today = new Date().toDateString();
  return `<ul class="list agenda">${list.map((e) => `<li><span class="k">${e.allDay ? "All day" : hm(e.start)}</span><span class="v">${esc(e.title)}${new Date(e.start).toDateString() !== today ? ' <small>tomorrow</small>' : ""}</span>${e.join ? `<button class="join" data-join="${esc(e.join)}">Join</button>` : ""}</li>`).join("")}</ul>`;
}
const wireJoin = () => document.querySelectorAll("#card [data-join]").forEach((b) => (b.onclick = (ev) => { ev.stopPropagation(); J.openExternal(b.dataset.join); cardOpen = false; }));
function agendaCard(said = "") {
  if (!settings.icalUrl) return { icon: "cal", kicker: "Calendar", said, title: "No calendar connected", body: "Paste your calendar's private iCal link in Settings and your meetings show up here, with a Join button.", chips: [{ label: "Open Settings", run: () => J.openPanel("settings") }] };
  const now = Date.now(), list = cal.filter((e) => Date.parse(e.end) > now).slice(0, 8);
  const next = list.find((e) => !e.allDay);
  return { icon: "cal", kicker: "Calendar", said, stay: true,
    title: next ? `Next: ${next.title} at ${hm(next.start)}` : list.length ? "No more meetings today" : "Nothing today or tomorrow",
    html: list.length ? agendaRows(list) : "", after: wireJoin };
}

// ---------------- email (read-only, IMAP) ----------------
let mailSeen = null;
J.onMail((m) => {
  mail = m;
  if (!m || m.error || !m.messages) return;
  const max = Math.max(0, ...m.messages.map((x) => x.uid));
  if (mailSeen !== null) for (const x of m.messages.filter((x) => x.uid > mailSeen).slice(0, 3)) notify({ app: "mail", from: x.from, msg: x.subject });
  mailSeen = Math.max(mailSeen ?? 0, max);
});
const inboxUrl = () => /gmail|googlemail/i.test(settings.mailUser || "") ? "https://mail.google.com" : /outlook|hotmail|live\.|msn/i.test(settings.mailUser || "") ? "https://outlook.live.com/mail" : "";
const mailList = (msgs) => `<ul class="list">${msgs.map((x) => `<li><span class="k">${agoShort(Date.parse(x.date) || Date.now())}</span><span class="v"><b style="font-weight:600;color:var(--fg)">${esc(x.from)}</b> · ${esc(x.subject)}</span></li>`).join("")}</ul>`;
async function mailCard(said = "") {
  if (!settings.mailUser || !settings.hasMailPass) return { icon: "mail", kicker: "Email", said, title: "No email connected", body: "Add your email address and an app password in Settings. I only read: nothing gets marked, moved or sent.", chips: [{ label: "Open Settings", run: () => J.openPanel("settings") }] };
  const m = (await J.refreshMail()) || mail;
  if (!m || m.error) return { icon: "mail", kicker: "Email", said, title: "Couldn't check your email", body: m?.error || "" };
  const url = inboxUrl();
  return { icon: "mail", kicker: "Email", said, stay: true, title: m.unread ? `${m.unread} unread` : "Inbox zero. Nothing unread.",
    html: m.messages.length ? mailList(m.messages.slice(0, 6)) : "",
    chips: [...(m.messages.length ? [{ label: "What matters?", run: () => { cardOpen = false; askClaude(`Here are my unread emails (newest first). Tell me which ones matter and why, in a few lines:\n${m.messages.map((x) => `- ${x.from}: ${x.subject} (${x.date})`).join("\n")}`, "Which emails matter?"); } }] : []),
      ...(url ? [{ label: "Open inbox", run: () => { J.openExternal(url); cardOpen = false; } }] : [])] };
}

// ---------------- morning briefing: first time you come to the island each day ----------------
async function quickWeather(city) {
  const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(city)}`).then((r) => r.json());
  const p = g.results?.[0]; if (!p) return null;
  const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`).then((r) => r.json());
  return { place: p.name, now: Math.round(w.current.temperature_2m), hi: Math.round(w.daily.temperature_2m_max[0]), lo: Math.round(w.daily.temperature_2m_min[0]), rain: w.daily.precipitation_probability_max[0] };
}
function maybeBrief() {
  if (settings.morningBriefing === false || !settings.onboarded || mode !== "dock" || s !== "idle" || task || cardOpen || perms.size) return;
  const d = new Date(); if (d.getHours() < 4 || d.getHours() >= 14) return;
  const key = d.toDateString();
  try { if (localStorage.getItem("jarvis-brief-day") === key) return; localStorage.setItem("jarvis-brief-day", key); } catch { return; }
  briefing().then((a) => { if (!cardOpen && s === "idle" && !task) show(a); });
}
async function briefing(said = "") {
  const d = new Date(), h = d.getHours();
  const greet = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const [w, m] = await Promise.all([quickWeather(settings.city || "Budapest").catch(() => null), settings.mailUser && settings.hasMailPass ? J.refreshMail().catch(() => null) : null]);
  const sec = (label, html) => `<div class="sec">${label}</div>${html}`;
  const parts = [];
  if (w) parts.push(`<div class="tiles"><div class="tile"><small>${esc(w.place)}</small><b>${w.now}°</b></div><div class="tile"><small>High / low</small><b>${w.hi}° / ${w.lo}°</b></div><div class="tile"><small>Rain</small><b>${w.rain}%</b></div></div>`);
  const today = cal.filter((e) => new Date(e.start).toDateString() === d.toDateString() && Date.parse(e.end) > Date.now());
  if (settings.icalUrl) parts.push(sec("Today", today.length ? agendaRows(today.slice(0, 5)) : `<p class="body">No meetings left today.</p>`));
  if (m && !m.error) parts.push(sec("Email", m.unread ? mailList(m.messages.slice(0, 3)) + (m.unread > 3 ? `<p class="note">+${m.unread - 3} more unread</p>` : "") : `<p class="body">Nothing unread.</p>`));
  let log = []; try { log = JSON.parse(localStorage.getItem("jarvis-cc-log") || "[]"); } catch {}
  const since = Date.now() - 14 * 3600e3, night = log.filter((x) => x.at > since);
  if (night.length) parts.push(sec("Claude Code finished", `<ul class="list">${night.slice(0, 4).map((x) => `<li><span class="k">${hm(new Date(x.at).toISOString())}</span><span class="v"><b style="font-weight:600;color:var(--fg)">${esc(x.project)}</b> · ${esc(x.last)}</span></li>`).join("")}</ul>`));
  if (update) parts.push(sec("Jarvis", `<p class="body">Version ${esc(update)} is ready to install.</p>`));
  return { icon: "sun", kicker: d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }), said, title: `${greet}, ${settings.name || "sir"}.`, stay: true,
    html: parts.join("") || `<p class="body">Connect your calendar and email in Settings and they show up here each morning.</p>`,
    chips: [...(m?.messages?.length ? [{ label: "What matters in my email?", run: () => { cardOpen = false; askClaude(`My unread emails:\n${m.messages.map((x) => `- ${x.from}: ${x.subject}`).join("\n")}\nWhich ones matter today and why? Keep it short.`, "What matters in my email?"); } }] : []),
      ...(update ? [{ label: "Update now", run: () => J.installUpdate() }] : [])],
    after: wireJoin };
}

// ---------------- auto-update ----------------
function offerUpdate(v) {
  if (!v || update === v) return;
  update = v;
  notify({ app: "update", from: "Update ready", msg: `Jarvis ${v} · click to restart`, chips: [{ label: "Restart now", run: () => J.installUpdate() }] });
}
J.onUpdateReady((u) => offerUpdate(u?.version));
async function updateCard(said) {
  if (update) return { icon: "update", kicker: "Jarvis", said, title: `Version ${update} is ready`, body: "Jarvis restarts in a few seconds.", chips: [{ label: "Restart now", run: () => J.installUpdate() }] };
  const v = await J.checkUpdate();
  if (v) { offerUpdate(v); return null; }
  return { icon: "update", kicker: "Jarvis", said, title: `You're on the latest version (${settings.version || ""})`, body: settings.hasUpdateToken ? "" : "While the project is private, add a GitHub token in Settings so I can find updates." };
}
J.onShow?.((v) => {
  if (v === "clipboard") show(clipCard());
  else if (v === "calendar") show(agendaCard());
  else if (v === "mail") mailCard().then(show);
  else if (v === "briefing") briefing().then(show);
  else if (v === "notifications") { show(notifCenter()); unread = 0; }
});

// ---------------- start ----------------
(async () => {
  settings = await J.getSettings();
  setInterval(async () => { settings = await J.getSettings(); }, 20000);
  J.getCalendar().then((r) => { cal = r?.events || []; }).catch(() => {});
  J.getMail().then((m) => { if (m) mail = m; if (m?.messages) mailSeen = Math.max(0, ...m.messages.map((x) => x.uid)); }).catch(() => {});
  if (settings.updateReady) offerUpdate(settings.updateReady);
  if ((await J.islandMode()) === "widget") applyMode("widget");
  setS("idle");
})();
J.onSetupDone(async () => { settings = await J.getSettings(); await new Promise((r) => setTimeout(r, 1000)); show({ icon: "info", kicker: "Jarvis", title: "Hi. I’m here.", body: `Click me or press ${settings.hotkeyTalk || "Alt+J"} and ask anything.` }); });
