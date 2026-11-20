# Jarvis

A black island at the top of your Windows screen, powered by your own Claude account. Click it (or press **Alt+J**) and ask anything by voice. You can also press **T** to type. Answers drop down as clean cards. It shows what Claude is doing while it works, plays nicely with your music, and can do things on your PC when you allow it.

## The island

- **Idle:** a small black pill. **Hover** and it grows; **click** and it listens (red light, bars follow your voice).
- **Answers** drop down as cards. Click anywhere outside to shrink it back.
- **Claude working:** a spinner with the current step and a timer. Click it for the step list. **Needs your OK** opens a card with the exact command and **Run it / Don't**. **Ready** shows a green tick, then the answer.
- **Your Claude Code sessions:** when Claude Code works on a project (in the Claude app, the terminal or VS Code), the island shows it live: project name, each step (Reading…, Editing…, Running the tests), amber when it needs your permission, and a notification with its final message when it's done. It also shows how long it's been working and how many tokens this request has used, and if a maximized app has tucked the island away, the bump shows a small orange dot while Claude works. This works for Claude Code (the Code tab in the Claude app, the terminal, VS Code); ordinary Claude chats don't tell other apps anything. Restart open Claude Code sessions after installing Jarvis so they pick up the hooks. Jarvis adds small hooks to `~/.claude/settings.json` for this (on Windows it starts Windows' own curl.exe directly, so it works with or without Git Bash) (backup kept as `settings.json.jarvis-backup`); turn it off in Settings and they're removed.
- **Music:** what plays in a music app (Spotify and others) shows as a mini player: the real album cover, progress, equaliser. Click it for the player with ⏮ ⏯ ⏭ (real media keys). Videos in the browser (YouTube…) don't pop up; turn on "Show music playing in the browser" in Settings for YouTube Music or SoundCloud.
- **Timers:** an orange ring that drains. With music playing, the timer sits in its own little bubble.
- **Shelf:** drag files onto the island; click one later to open it.
- **Notifications:** Claude finishing, timers and approvals drop in from the island; the unread count stays as a red badge. Click the island to see them all.
- **Approve Claude Code from the island:** when Claude Code asks for permission, the island shows the exact command or file with **Allow / Deny / Answer in Claude**. No answer within two minutes and Claude Code asks in its own window as usual.
- **Other apps' notifications:** WhatsApp, Discord, Outlook, Teams and the rest drop in from the island too (read from Windows' own notification list, read-only). Click one to read it in full.
- **Next meeting:** paste your calendar's private iCal link in Settings and the island shows "Design review · in 4 min · **Join**" (Meet, Teams, Zoom, Webex), with a heads-up five minutes before.
- **Morning briefing:** the first time you come to the island each morning: weather, today's meetings, unread email and what your Claude Code sessions finished overnight. Say "brief me" any time.
- **Email (read-only):** add your address and an app password in Settings. New mail drops in; "check my email" lists it, and "What matters?" asks Claude to triage.
- **Clipboard history:** "clipboard" or right-click → Clipboard shows the last 20 things you copied. Click one to copy it again; Pin, Explain or Translate it. Password managers' copies are skipped.
- **Smart suggestions:** copy an error and the island offers "Explain it?"; when a download finishes you get **Open / Show in folder**.
- **Downloads:** a live pill with the file name, size and speed while Chrome, Edge or Firefox downloads.
- **Focus mode:** "focus for 45 minutes" starts a purple focus ring and holds notifications until the end (meetings and Claude's questions still come through), then shows what you missed.
- **Spotify:** connect it in Settings and "play Blinding Lights", "play my Chill playlist", "add this to Gym", "like this song", "more like this" really happen. Synced lyrics show under the mini player when you hover it, and in the player card.
- **Updates:** Jarvis downloads new versions in the background and shows **Update ready · Restart**.
- **Out of the way of full-screen apps:** when YouTube is full screen or Chrome (or anything) is maximized under the island, it tucks into a small black bump in the top edge. Click the bump, or pull it down, and the island pours back out; move away and it tucks back. Things that need you (Claude asking permission, a meeting, a message) still come out. Turn it off in Settings.
- **Flick it up** to hide it into the same bump yourself; click or pull the bump to bring it back.
- **Pull it down hard** to tear it off into a floating widget; drag it back to the top edge to dock. Right-click for Settings, Memory, Float/Dock and Quit.

Quick things run instantly on your PC without using Claude: weather (with the next hours), timers, maths, currency, notes, translation, play/pause/next, volume. Everything else goes to Claude.

## Install

1. Download **Jarvis-Setup-x.y.z.exe** from the latest release, or from this repo's **Actions → Build Jarvis for Windows → Artifacts**.
2. Run it. Windows will warn that the app is unsigned: click **More info → Run anyway**.
3. A black setup window opens. Each page is one question: connect your Claude account, say hi to test the microphone, allow screen control and Claude Code activity, your name and city, then optionally your calendar, email and Spotify. Jarvis isn't on your screen yet: there's an empty slot at the top of the window that fills as you go. At the end Jarvis drops into the slot; **drag it out of the window to the top of your screen** and it snaps into place (or press "Put it there for me"). Hearing (about 290 MB) downloads in the background meanwhile.

## What you can ask

| Say | What happens |
|---|---|
| "What's on my screen?" / "What does this error mean?" | Looks at your screen and explains |
| "Show me where the Wi-Fi settings are" | Points with its own glowing cursor. Touches nothing |
| "Fill in this form" / "Fix the typo in this paragraph" | Uses your mouse and keyboard. Asks first; **Esc** stops it |
| "Go through my unread emails" | Opens your mail in the browser and reads it to you. Never sends or deletes without asking |
| "Research the best budget monitors" | Searches the web and gives you the gist; offers to copy the details |
| "Find the biggest files in my Downloads" / "Open Spotify" | Runs PowerShell or opens things. Commands need your OK, by voice ("yes") or button |
| "Pause the music" / "Next song" / "Volume down" | Media keys |
| "25 minute focus timer" / "Remind me at 3pm to call Anna" | Speaks up and shows a notification when it's time |
| "Remember I prefer short answers" | Remembers across restarts (right-click → Memory to view or delete) |

The talk hotkey is **Alt+J** by default. You can change it in Settings.

## Privacy

- **Hearing and voice run on your PC.** Speech recognition uses Whisper and the voice uses Kokoro, so audio never leaves your computer. Only the text of what you say is sent to Claude.
- **Screenshots** are taken only when Jarvis needs to look, and are sent to Claude for that request.
- **Commands and mouse/keyboard control** always ask first. **Esc** stops control instantly.
- **Your Claude account:** Jarvis uses Claude Code signed in with your account, and it counts toward your plan's usage like normal Claude use.

## How it's built

| File | What it does |
|---|---|
| `src/main.js` | Windows, tray, hotkey, the Claude connection and every tool that touches the PC |
| `src/claude-code.js` | Runs Claude Code with your account, and gives it Jarvis's tools via a local MCP server |
| `src/ml-worker.js` | Whisper and Kokoro in their own process, so the UI never stutters |
| `src/input-driver.js` | Mouse and keyboard control (Windows) |
| `src/renderer/blob.*` | The liquid ball: metaball geometry and spring physics |
| `src/renderer/brain.*` | Hidden window: microphone, voice-activity detection, playback, conversation, voice approvals |
| `src/renderer/panel.*` | Setup, settings, memory and the approval card |
| `src/renderer/cursor.*` | Jarvis's own on-screen cursor |

```bash
cd jarvis-desktop
npm install
npm start        # run from source
npm run dist     # build the installer (on Windows)
```

## One-time setup for the extras (all optional, in Settings)

| Feature | What to paste |
|---|---|
| Calendar | Google Calendar: Settings → your calendar → **Secret address in iCal format**. Outlook: Settings → Calendar → Shared calendars → Publish → ICS link |
| Email | Your address + an **app password** (Gmail: Google Account → Security → 2-Step Verification → App passwords). Read-only |
| Spotify | Create an app at developer.spotify.com, add the redirect URI shown in Settings, paste the **Client ID**, press Connect. Playback needs Premium |
| Updates | Nothing while this repo is public. If it is ever made private: a fine-grained GitHub token with read-only access to it (Contents: read) |

Passwords and tokens are stored encrypted with Windows' own data protection.

## Troubleshooting

Jarvis keeps a small diagnostics log at `%APPDATA%\Jarvis\jarvis.log` (cover art, hooks, notifications, calendar, email, update and Spotify status; no message content).
