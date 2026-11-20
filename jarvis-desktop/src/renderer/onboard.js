// Jarvis onboarding: one big line and one action per page. Jarvis isn't on your screen yet, just an
// empty slot at the top of this window that fills as you go. At the end the island drops into the
// slot; drag it out of the window to the top of your screen and it snaps into place.
const J = window.jarvis;
const $ = (id) => document.getElementById(id);
const pages = [...document.querySelectorAll(".step")];
let step = -1, settings = {};

// words rise in one by one
document.querySelectorAll(".words").forEach(splitWords);
function splitWords(h) { h.innerHTML = h.textContent.split(/(\s+)/).map((w, k) => (/^\s+$/.test(w) ? w : `<span class="w" style="--k:${k / 2}">${w}</span>`)).join(""); }
function retitle(h, text) { h.textContent = text; splitWords(h); }
pages.forEach((p) => [...p.children].forEach((c, i) => c.style.setProperty("--i", i)));

$("dots").innerHTML = pages.slice(0, -1).map(() => "<i></i>").join("");
const name = () => pages[step]?.dataset.name;
function go(n) {
  if (n === step || n < 0 || n >= pages.length) return;
  const prev = pages[step];
  if (prev) { prev.classList.remove("on"); prev.classList.add("leave"); setTimeout(() => prev.classList.remove("leave"), 380); }
  step = n;
  setTimeout(() => { pages[n].classList.add("on"); pages[n].querySelector("input,.primary")?.focus({ preventScroll: true }); }, prev ? 240 : 0);
  $("dots").querySelectorAll("i").forEach((d, i) => { d.classList.toggle("on", i < n); d.classList.toggle("cur", i === n); });
  $("sheet").hidden = true;
  if (name() !== "mic") stopMic();
  if (name() === "claude") checkAccount();
  if (name() === "finale") finale();
}
const next = async () => { await save(); go(step + 1); };
document.querySelectorAll("[data-next]").forEach((b) => (b.onclick = next));
document.querySelectorAll("input.big").forEach((i) => i.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); pages[step].querySelector(".primary")?.click(); } }));
$("close").onclick = () => J.onboardSkip();

// yes / no pages
const YES = { allowControl: (v) => ({ allowControl: v }), activity: (v) => ({ claudeActivity: v, approveFromIsland: v, otherNotifications: v }) };
document.querySelectorAll("[data-yes]").forEach((b) => (b.onclick = async () => { await J.setSettings(YES[b.dataset.yes](true)); go(step + 1); }));
document.querySelectorAll("[data-no]").forEach((b) => (b.onclick = async () => { await J.setSettings(YES[b.dataset.no](false)); go(step + 1); }));

async function save() {
  if (name() === "name") settings = await J.setSettings({ name: $("fName").value.trim() || settings.name || "sir" });
  if (name() === "city" && $("fCity").value.trim()) settings = await J.setSettings({ city: $("fCity").value.trim() });
}

// ---------------- Claude account
let poll = null;
async function checkAccount() {
  const btn = $("acctBtn");
  btn.disabled = true;
  const st = await J.claudeStatus();
  btn.disabled = false;
  if (st.loggedIn) {
    clearInterval(poll);
    retitle($("acctTitle"), "You're connected.");
    btn.classList.add("ok"); btn.textContent = "Continue";
    btn.nextElementSibling.hidden = true;
    btn.onclick = () => go(step + 1);
    return;
  }
  btn.textContent = "Sign in";
  btn.onclick = async () => {
    await J.claudeSignIn();
    btn.textContent = "Waiting for your browser…"; btn.disabled = true;
    clearInterval(poll);
    poll = setInterval(async () => { if ((await J.claudeStatus()).loggedIn) checkAccount(); }, 2500);
    setTimeout(() => { if (btn.disabled) { btn.disabled = false; btn.textContent = "Sign in again"; } }, 20000);
  };
}

// ---------------- microphone: the drop breathes with your voice
let mic = null;
$("micBtn").onclick = async () => {
  if (mic) return go(step + 1);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new AudioContext(), an = ctx.createAnalyser(); an.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize); let heard = false, lvlS = 0;
    mic = { stream, ctx, raf: 0 };
    $("voice").classList.add("live"); $("micBtn").textContent = "Continue";
    const loop = () => {
      an.getByteTimeDomainData(buf); let s = 0; for (const v of buf) { const x = (v - 128) / 128; s += x * x; }
      const lvl = Math.min(1, Math.sqrt(s / buf.length) * 6);
      lvlS = lvlS * .7 + lvl * .3;
      $("voice").style.setProperty("--lvl", lvlS.toFixed(3));
      if (lvl > 0.15 && !heard) { heard = true; $("voice").classList.add("heard"); retitle($("micTitle"), "I can hear you."); }
      mic.raf = requestAnimationFrame(loop);
    };
    loop();
  } catch {
    retitle($("micTitle"), "Your microphone is blocked.");
    showSheet("Open Windows <b>Settings → Privacy & security → Microphone</b> and turn on <b>Let desktop apps access your microphone</b>. Then press Allow again.");
  }
};
function stopMic() { if (!mic) return; cancelAnimationFrame(mic.raf); mic.stream.getTracks().forEach((t) => t.stop()); mic.ctx.close(); mic = null; $("voice").classList.remove("live"); }

// ---------------- how-to sheets
const URI = "http://127.0.0.1:47824/spotify/callback";
const HELP = {
  cal: "In <b>Google Calendar</b>: ⚙ Settings → click your calendar on the left → <b>Integrate calendar</b> → copy <b>Secret address in iCal format</b>.<br>In <b>Outlook</b>: Settings → Calendar → Shared calendars → <b>Publish a calendar</b> → copy the ICS link.",
  mail: "Google Account → <b>Security</b> → turn on 2-Step Verification → search <b>App passwords</b> → make one called Jarvis and paste the 16 letters. I only read: nothing gets marked, moved or sent.",
  spotify: `Go to <b>developer.spotify.com</b> → Dashboard → <b>Create app</b>. Tick <b>Web API</b>, add the redirect URI <code id="uri">${URI}</code> (click to copy), save, and paste the app's <b>Client ID</b>. Playing needs Premium.`,
};
function showSheet(html) {
  $("sheetText").innerHTML = html; $("sheet").hidden = false;
  $("sheet").style.animation = "none"; void $("sheet").offsetWidth; $("sheet").style.animation = "";
  $("uri")?.addEventListener("click", (e) => { J.clipWrite(URI); e.target.textContent = "Copied ✓"; setTimeout(() => (e.target.textContent = URI), 1500); });
}
document.querySelectorAll("[data-help]").forEach((b) => (b.onclick = () => showSheet(HELP[b.dataset.help])));
$("sheetOk").onclick = () => ($("sheet").hidden = true);

// ---------------- connect buttons: check right away, show the result in one line
function result(id, input, btn, ok, text) {
  $(id).className = "res " + (ok ? "good" : "bad"); $(id).textContent = text;
  input.classList.toggle("good", ok); input.classList.toggle("bad", !ok);
  btn.disabled = false;
  if (ok) { btn.classList.add("ok"); btn.textContent = "Continue"; btn.onclick = next; btn.nextElementSibling.hidden = true; }
  else btn.textContent = "Try again";
}
$("calBtn").onclick = async () => {
  const url = $("fCal").value.trim(), btn = $("calBtn");
  if (!url) return result("calRes", $("fCal"), btn, false, "Paste the link first.");
  btn.disabled = true; btn.textContent = "Checking…";
  settings = await J.setSettings({ icalUrl: url });
  const r = await J.refreshCalendar();
  if (r?.error) return result("calRes", $("fCal"), btn, false, r.error);
  const n = r?.events?.length || 0;
  result("calRes", $("fCal"), btn, true, n ? `✓ ${n} event${n > 1 ? "s" : ""} today and tomorrow` : "✓ Connected");
};
$("mailBtn").onclick = async () => {
  const user = $("fMail").value.trim(), pass = $("fPass").value.trim(), btn = $("mailBtn");
  if (!user || !pass) return result("mailRes", user ? $("fPass") : $("fMail"), btn, false, "Your address and an app password, please.");
  btn.disabled = true; btn.textContent = "Checking…";
  settings = await J.setSettings({ mailUser: user, mailPass: pass });
  const m = await J.refreshMail();
  if (!m || m.error) return result("mailRes", $("fPass"), btn, false, m?.error || "Couldn't sign in.");
  result("mailRes", $("fPass"), btn, true, m.unread ? `✓ ${m.unread} unread` : "✓ Inbox zero");
};
$("spBtn").onclick = async () => {
  const id = $("fSp").value.trim(), btn = $("spBtn");
  if (!id) return showSheet(HELP.spotify);
  btn.disabled = true; btn.textContent = "Finish in your browser…";
  settings = await J.setSettings({ spotifyClientId: id });
  const r = await J.spotifyConnect();
  result("spRes", $("fSp"), btn, r.ok, r.ok ? "✓ Connected" : r.error || "Didn't connect.");
};

// ---------------- hearing download, quietly in the background
let dlPct = 0;
J.onSttProgress((p) => {
  if (p.error) return ($("hear").textContent = "");
  dlPct = p.ready ? 100 : Math.min(99, Math.max(dlPct, p.pct));
  $("hear").textContent = dlPct >= 100 ? "Hearing ready" : `Getting my hearing ready · ${dlPct}%`;
});

// ---------------- finale: Jarvis drops in; drag it to the top of your screen
const isle = $("isle");
function finale() {
  $("slot").classList.add("full");
  setTimeout(() => { $("slot").classList.add("gone"); isle.classList.add("on"); }, 500);
}
let grabbing = false;
isle.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  isle.setPointerCapture(e.pointerId);
  grabbing = true;
  isle.classList.add("grabbed"); isle.classList.remove("back", "wiggle");
  J.onboardGrab();
});
isle.addEventListener("pointerup", async () => {
  if (!grabbing) return;
  grabbing = false;
  if (await J.onboardDrop()) return bye();
  isle.classList.remove("grabbed"); void isle.offsetWidth; isle.classList.add("back");
  retitle($("finTitle"), "Higher. Right to the top.");
});
isle.addEventListener("lostpointercapture", () => { if (grabbing) isle.dispatchEvent(new PointerEvent("pointerup")); });
isle.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); place(); } });
$("placeBtn").onclick = () => place();
async function place() {
  const r = isle.getBoundingClientRect();
  isle.classList.add("grabbed");
  if (await J.onboardPlace({ x: Math.round(window.screenX + r.left + r.width / 2), y: Math.round(window.screenY + r.top + r.height / 2) })) bye();
}
function bye() { retitle($("finTitle"), "Perfect."); setTimeout(() => $("win").classList.add("bye"), 700); }
setInterval(() => { if (name() === "finale" && !grabbing && isle.classList.contains("on")) { isle.classList.remove("wiggle"); void isle.offsetWidth; isle.classList.add("wiggle"); } }, 5000);

// ---------------- start
(async () => {
  settings = await J.getSettings();
  $("fName").value = settings.name && settings.name !== "sir" ? settings.name : "";
  $("fCity").value = settings.city || "";
  $("fCal").value = settings.icalUrl || "";
  $("fMail").value = settings.mailUser || "";
  $("fSp").value = settings.spotifyClientId || "";
  J.warmup();   // start downloading the hearing model now
  go(0);
})();
