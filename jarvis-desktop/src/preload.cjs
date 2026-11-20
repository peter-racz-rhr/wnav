// Safe bridge between Jarvis's windows (island, panel, cursor) and the main process.
const { contextBridge, ipcRenderer, webUtils } = require("electron");

const on = (channel) => (fn) => {
  const h = (_e, data) => fn(data);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

contextBridge.exposeInMainWorld("jarvis", {
  // conversation
  send: (text, withScreen) => ipcRenderer.invoke("chat:send", { text, withScreen }),
  stop: () => ipcRenderer.send("chat:stop"),
  reset: () => ipcRenderer.send("chat:reset"),
  transcribe: (samples) => ipcRenderer.invoke("stt:transcribe", samples),
  tts: (text) => ipcRenderer.invoke("tts:speak", text),
  warmup: () => ipcRenderer.invoke("stt:warmup"),
  notify: (title, body) => ipcRenderer.send("notify", { title, body }),
  onAgent: on("agent"),

  // island window
  hover: (on) => ipcRenderer.send("island:hover", on),
  menu: () => ipcRenderer.send("island:menu"),
  tear: () => ipcRenderer.send("island:tear"),
  dragStart: () => ipcRenderer.send("island:dragStart"),
  dragEnd: () => ipcRenderer.send("island:dragEnd"),
  islandMode: () => ipcRenderer.invoke("island:mode"),
  focusIsland: () => ipcRenderer.send("island:focus"),
  onIslandMode: on("island:mode"),
  onTalk: on("island:talk"),
  onToggleHide: on("island:toggleHide"),
  onShow: on("island:show"),
  onAutoHide: on("island:autoHide"),
  onCarry: on("island:carry"),
  onSnap: on("island:snap"),
  // onboarding window
  onboardGrab: () => ipcRenderer.send("onboard:grab"),
  onboardDrop: () => ipcRenderer.invoke("onboard:drop"),
  onboardPlace: (from) => ipcRenderer.invoke("onboard:place", from),
  onboardSkip: () => ipcRenderer.send("onboard:skip"),
  mediaKey: (action) => ipcRenderer.send("pc:mediaKey", action),
  openExternal: (url) => ipcRenderer.send("pc:openExternal", url),
  openPath: (p) => ipcRenderer.invoke("pc:openPath", p),
  filePath: (file) => webUtils.getPathForFile(file),
  onMedia: on("media:now"),
  onCcEvent: on("cc:event"),
  onCcPerm: on("cc:perm"),
  onCcPermDone: on("cc:permDone"),
  answerPerm: (id, decision) => ipcRenderer.send("cc:permAnswer", { id, decision }),
  onToast: on("win:toast"),
  onClip: on("clip:new"),
  clipWrite: (text) => ipcRenderer.send("clip:write", text),
  onDownload: on("dl:update"),
  onDownloadDone: on("dl:done"),
  showInFolder: (p) => ipcRenderer.send("pc:showInFolder", p),
  getCalendar: () => ipcRenderer.invoke("cal:get"),
  refreshCalendar: () => ipcRenderer.invoke("cal:refresh"),
  onCalendar: on("cal:events"),
  getMail: () => ipcRenderer.invoke("mail:get"),
  refreshMail: () => ipcRenderer.invoke("mail:refresh"),
  onMail: on("mail:update"),
  onUpdateReady: on("update:ready"),
  checkUpdate: () => ipcRenderer.invoke("update:check"),
  installUpdate: () => ipcRenderer.send("update:install"),
  spotify: (action, query) => ipcRenderer.invoke("spotify:do", { action, query }),
  spotifyConnect: () => ipcRenderer.invoke("spotify:connect"),
  spotifyDisconnect: () => ipcRenderer.invoke("spotify:disconnect"),
  lyrics: (q) => ipcRenderer.invoke("lyrics:get", q),

  // panel: setup, settings, memory, approvals
  openPanel: (view) => ipcRenderer.send("panel:open", view),
  closePanel: () => ipcRenderer.send("panel:close"),
  resizePanel: (h) => ipcRenderer.send("panel:resize", h),
  setupDone: () => ipcRenderer.send("setup:done"),
  onPanel: on("panel:open"),
  approve: (id, approved) => ipcRenderer.send("approval:respond", { id, approved }),
  onApprovalResolved: on("approval:resolved"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),
  getMemory: () => ipcRenderer.invoke("memory:get"),
  deleteMemory: (i) => ipcRenderer.invoke("memory:delete", i),
  onMemory: on("memory"),
  claudeSignIn: () => ipcRenderer.invoke("claude:signin"),
  claudeStatus: () => ipcRenderer.invoke("claude:status"),
  onSttProgress: on("stt:progress"),
  onSetupDone: on("setup:done"),
  quit: () => ipcRenderer.send("app:quit"),

  // cursor overlay
  onCursor: on("cursor"),
});
