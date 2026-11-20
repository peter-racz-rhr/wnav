// The only text UI Jarvis has: a small card for setup, settings, memory and approvals.
const J = window.jarvis;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
let view = null, settings = {};

// keep the window exactly as tall as the card
new ResizeObserver(() => J.resizePanel(document.body.scrollHeight)).observe($("card"));

function show(v) {
  view = v;
  for (const id of ["approval", "setup", "settings", "memory"]) $("v-" + id).hidden = id !== v;
  $("card").style.animation = "none"; void $("card").offsetWidth; $("card").style.animation = "";
}
J.onPanel(async ({ view: v, data }) => {
  settings = await J.getSettings();
  show(v);
  if (v === "approval") openApproval(data);
  if (v === "setup") startSetup();
  if (v === "settings") fillSettings();
  if (v === "memory") renderMemory(await J.getMemory());
});
document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => J.closePanel()));
addEventListener("keydown", (e) => { if (e.key === "Escape" && (view === "settings" || view === "memory")) J.closePanel(); });

// ---------------------------------------------------------- approval
let approvalId = null;
function openApproval({ id, command, reason, kind }) {
  approvalId = id;
  $("apQ").textContent = kind === "control" ? "Let me use your mouse and keyboard for this task?" : (reason || "Run this command on your PC?");
  $("apCmd").textContent = kind === "control" ? "" : command;
  $("apYes").textContent = kind === "control" ? "Allow" : "Run it";
}
$("apYes").onclick = () => approvalId && J.approve(approvalId, true);
$("apNo").onclick = () => approvalId && J.approve(approvalId, false);
J.onApprovalResolved(({ id }) => { if (id === approvalId) approvalId = null; });

// ---------------------------------------------------------- setup
let step = 0, mic = null, poll = null, dlPct = 0, dlReady = false;
function startSetup() { J.warmup(); go(0); }   // start downloading the voice right away
function go(n) {
  step = n;
  document.querySelectorAll(".step").forEach((s) => s.classList.toggle("on", +s.dataset.step === n));
  if (n !== 2) stopMic();
  if (n === 1) checkAccount();
  if (n === 4) renderDl();
}
document.querySelectorAll("[data-next]").forEach((b) => (b.onclick = () => go(step + 1)));

async function checkAccount() {
  const btn = $("acctBtn");
  btn.disabled = true; $("acctOk").textContent = "";
  const st = await J.claudeStatus();
  btn.disabled = false;
  if (st.loggedIn) {
    $("acctText").textContent = "You're signed in. I'll use your Claude plan, so there's no API key and nothing extra to pay.";
    $("acctOk").textContent = "✓ Connected"; btn.textContent = "Continue"; btn.onclick = () => go(2);
    return;
  }
  $("acctText").innerHTML = st.installed
    ? "Press <b>Sign in</b>. Your browser opens; log in with your Claude account (Pro or Max). No API key needed."
    : "Press <b>Sign in</b>. A window installs Claude Code (about a minute), then your browser asks you to log in with your Claude account. No API key needed.";
  btn.textContent = "Sign in";
  btn.onclick = async () => {
    await J.claudeSignIn();
    $("acctOk").style.color = "var(--muted)"; $("acctOk").textContent = "Waiting for you to sign in…";
    clearInterval(poll);
    poll = setInterval(async () => {
      const s = await J.claudeStatus();
      if (s.loggedIn) { clearInterval(poll); $("acctOk").style.color = ""; checkAccount(); }
    }, 2500);
  };
}

$("micBtn").onclick = async () => {
  if (mic) return go(3);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new AudioContext(), an = ctx.createAnalyser(); an.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize); let heard = false;
    mic = { stream, ctx, raf: 0 };
    $("micHint").textContent = "Say something…"; $("micBtn").textContent = "Continue";
    const loop = () => {
      an.getByteTimeDomainData(buf); let s = 0; for (const v of buf) { const x = (v - 128) / 128; s += x * x; }
      const lvl = Math.min(1, Math.sqrt(s / buf.length) * 5);
      $("micMeter").style.width = lvl * 100 + "%";
      if (lvl > 0.15 && !heard) { heard = true; $("micHint").textContent = "✓ I can hear you."; }
      mic.raf = requestAnimationFrame(loop);
    };
    loop();
  } catch {
    $("micHint").textContent = "Blocked. Open Windows Settings → Privacy & security → Microphone and turn on “Let desktop apps access your microphone”, then press Allow again.";
  }
};
function stopMic() { if (!mic) return; cancelAnimationFrame(mic.raf); mic.stream.getTracks().forEach((t) => t.stop()); mic.ctx.close(); mic = null; }

J.onSttProgress((p) => {
  if (p.error) { $("dlHint").textContent = "The download failed. Check your internet; I'll retry next time I start."; return; }
  if (p.ready) { dlReady = true; dlPct = 100; } else dlPct = Math.min(99, Math.max(dlPct, p.pct));
  renderDl();
});
function renderDl() {
  $("dlMeter").style.width = dlPct + "%";
  $("dlHint").textContent = dlReady ? "✓ Ready." : dlPct ? `Downloading… ${dlPct}%  ·  you can finish now, it continues in the background` : "Starting…";
}
$("finish").onclick = async () => {
  await J.setSettings({ allowControl: $("ctl").checked, claudeActivity: $("ccAct").checked, onboarded: true });
  J.setupDone();
};

// ---------------------------------------------------------- settings
const form = $("form");
async function fillSettings() {
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === "checkbox") el.checked = !!settings[el.name]; else el.value = settings[el.name] ?? "";
  }
  $("saved").textContent = "";
  $("mailPass").value = ""; $("mailPass").placeholder = settings.hasMailPass ? "Saved (type to change)" : "16 letters";
  $("updToken").value = ""; $("updToken").placeholder = settings.hasUpdateToken ? "Saved (type to change)" : "github_pat_…";
  $("verHint").textContent = `You're on Jarvis ${settings.version || ""}.${settings.updateReady ? ` Version ${settings.updateReady} is ready: it installs when you restart.` : ""}`;
  renderSpotify();
  $("acctState").textContent = "Checking…";
  const st = await J.claudeStatus();
  $("acctState").innerHTML = st.loggedIn ? "<b>Connected</b> to your Claude account." : st.installed ? "<b>Not signed in.</b>" : "<b>Claude Code isn't installed.</b>";
  $("acctSwitch").textContent = st.loggedIn ? "Switch account" : "Sign in";
}
$("acctSwitch").onclick = () => J.claudeSignIn();
function renderSpotify(msg) {
  $("spHint").innerHTML = `Make a free app at <b>developer.spotify.com</b> → Dashboard → Create app, add the redirect URI <b>${esc(settings.spotifyRedirect || "")}</b>, tick Web API, and paste its Client ID here. One-click playback needs Premium.`;
  $("spState").innerHTML = msg ? esc(msg) : settings.spotifyConnected ? "<b>Connected</b>. Say “play …”, “add this to …”, “more like this”." : "Not connected.";
  $("spBtn").textContent = settings.spotifyConnected ? "Disconnect" : "Connect";
}
$("spBtn").onclick = async () => {
  if (settings.spotifyConnected) { await J.spotifyDisconnect(); settings = await J.getSettings(); return renderSpotify(); }
  const id = form.elements.spotifyClientId.value.trim();
  if (!id) return renderSpotify("Paste the Client ID first.");
  settings = await J.setSettings({ spotifyClientId: id });
  renderSpotify("Finish in your browser…");
  const r = await J.spotifyConnect();
  settings = await J.getSettings();
  renderSpotify(r.ok ? "" : r.error);
};
form.onsubmit = async (e) => {
  e.preventDefault();
  const patch = {};
  for (const el of form.elements) if (el.name) patch[el.name] = el.type === "checkbox" ? el.checked : el.value.trim();
  const res = await J.setSettings(patch);
  settings = res;
  const bad = (res.hotkeys || []).filter((h) => /\(/.test(h));
  $("saved").style.color = bad.length ? "var(--warn)" : "";
  $("saved").textContent = bad.length ? `Hotkey problem: ${bad.join(", ")}` : "✓ Saved";
  if (patch.speechModel) J.warmup();
};
$("quit").onclick = () => J.quit();

// ---------------------------------------------------------- memory
function renderMemory(m) {
  $("mem").innerHTML = m.notes.length
    ? m.notes.map((n, i) => `<li><div>${esc(n.note)}<small>${new Date(n.at).toLocaleDateString()}</small></div><button data-i="${i}">Forget</button></li>`).reverse().join("")
    : `<li class="none">Nothing yet. Say “remember that…” and it shows up here.</li>`;
}
$("mem").onclick = async (e) => { const b = e.target.closest("button[data-i]"); if (b) renderMemory(await J.deleteMemory(+b.dataset.i)); };
J.onMemory((m) => view === "memory" && renderMemory(m));
