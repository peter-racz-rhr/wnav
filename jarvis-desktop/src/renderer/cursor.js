// Jarvis's visible cursor. Positions arrive in this window's own coordinates (DIPs).
const c = document.getElementById("c"), label = document.getElementById("label");
let hideTimer = null;
window.jarvis.onCursor(({ x, y, text, click, hide, holdMs }) => {
  clearTimeout(hideTimer);
  if (hide) { c.classList.remove("on"); return; }
  c.style.transform = `translate(${x}px, ${y}px)`;
  c.classList.add("on");
  label.textContent = text || "";
  if (click) { c.classList.remove("click"); void c.offsetWidth; setTimeout(() => c.classList.add("click"), 520); }
  hideTimer = setTimeout(() => c.classList.remove("on"), holdMs || 4000);
});
