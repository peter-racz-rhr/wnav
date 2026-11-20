# Jarvis

A black island at the top of your Windows screen, powered by your own Claude account. Click it (or press **Alt+J**) and ask anything by voice; answers drop down as cards. It shows what Claude Code is doing in the background (with Allow / Deny for its permission requests), your music with synced lyrics, your next meeting with a Join button, other apps' notifications, downloads, timers and focus sessions, and it can look at your screen and use your PC when you ask.

## Download

**[Latest release → Jarvis-Setup-x.y.z.exe](https://github.com/peter-racz-rhr/wnav/releases/latest)**

Run it (Windows may warn that the app is unsigned: **More info → Run anyway**) and follow the setup. Jarvis updates itself from this repo's releases after that.

## What's here

| Folder | What it is |
|---|---|
| [`jarvis-desktop/`](jarvis-desktop) | The Windows app (Electron). Full feature list, setup and privacy notes in its [README](jarvis-desktop/README.md) |
| [`jarvis-prototype/`](jarvis-prototype) | A single-page web prototype of every island state, used to design the UI |
| `.github/workflows/jarvis-desktop.yml` | Builds the installer on every push and publishes it as a release |
| `.claude/skills/apple-hig-designer` | The Apple HIG design skill used for the UI (MIT, see its LICENSE) |

## Build it yourself

```bash
cd jarvis-desktop
npm install
npm start        # run from source
npm run dist     # build the installer (on Windows)
```
