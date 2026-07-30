# Perch

View and control the Windows desktop already running on your laptop, from an Android phone, over your local Wi-Fi. It streams the live screen to the phone with WebRTC and injects your taps, drags, scrolls, and typing back into Windows. Nothing goes over the internet and it uses no mobile data: the phone and laptop talk directly across your LAN.

Built primarily to keep using an existing VS Code session (including the Codex / Claude extensions) from the couch, but it controls the whole desktop, not just one window.

> **Status:** working local MVP. Streaming, full input control, pinch-zoom, on-screen keyboard, multi-monitor switching, and PIN-based pairing all work; the Android app is release-signed and the desktop app is packaged as `Perch.exe`. Internet access (Tailscale), audio, and clipboard sync are not built yet: see [Roadmap](#roadmap).

## Documentation

- **[User Guide](docs/USER_GUIDE.md)** — install the app and use it. Start here if the laptop is already set up.
- **[Build & Developer Guide](docs/BUILD.md)** — build everything from source, architecture, and troubleshooting.

## What it does

- Streams your laptop's monitor to the phone (1080p, ~15 fps, hardware-encoded where available).
- **Trackpad mode**: one finger moves the cursor, tap to click, long-press to right-click.
- **Touch mode**: tap lands a click exactly where you touch on the screen.
- **Two-finger scroll**, **pinch-to-zoom** (up to 5×), and **pan** while zoomed.
- **On-screen keyboard** with a compose bar so you can see what you type, plus a shortcut bar (Esc, Tab, Ctrl+P, arrows, etc.).
- **Multi-monitor**: pick which screen to view and control, with clicks mapped correctly to each display.

## How it works (in one picture)

```text
┌─────────────────────────────┐        Wi-Fi / LAN         ┌────────────────────────┐
│ Windows laptop              │      (no internet)         │ Android phone          │
│                             │                            │                        │
│  Desktop agent (Electron)   │  ── WebRTC video ───────▶  │  Live desktop view     │
│   • captures the monitor    │                            │  • pinch / pan / zoom  │
│   • WebRTC host             │  ◀── control data channel ─│  • touch + keyboard    │
│   • input-helper.exe        │      (taps, keys, scroll)  │                        │
│      → Windows SendInput    │                            │                        │
│  Signaling: ws://…:43120    │  ◀── WebSocket signaling ──│                        │
└─────────────────────────────┘                            └────────────────────────┘
```

The desktop agent runs a small WebSocket **signaling** server on port `43120` (setup only), then opens a direct **WebRTC** peer connection for the video and a data channel for input. A tiny native helper (`input-helper.exe`) turns validated control messages into real Windows input via `SendInput`.

## Where is the desktop app?

After `pnpm dist` (see the [Build Guide](docs/BUILD.md)), the runnable app is at:

```text
apps/desktop-agent/release/win-unpacked/Perch.exe
```

It's portable: copy that `win-unpacked` folder anywhere and double-click `Perch.exe`. During development the agent instead runs from source via `pnpm dev`.

## Quick start (laptop already built)

1. On the laptop, start **Perch** (run `Perch.exe`, or `pnpm dev` from source). Its window should say `Listening on 0.0.0.0:43120`.
2. Allow the port through Windows Firewall once, in an **Administrator** PowerShell:
   ```powershell
   New-NetFirewallRule -DisplayName "Perch Agent" -Direction Inbound -LocalPort 43120 -Protocol TCP -Action Allow
   ```
3. Find the laptop's IP: run `ipconfig` and note the **IPv4 Address** of your active Wi-Fi/Ethernet adapter (e.g. `192.168.1.20`).
4. Install `perch.apk` on the phone and open **Perch**.
5. Make sure the phone is on the **same Wi-Fi**, enter the laptop IP and port `43120`, and tap **Connect**.

Full step-by-step with screenshots of each control is in the **[User Guide](docs/USER_GUIDE.md)**.

## Repository layout

```text
mobile-remote/
├── apps/
│   ├── desktop-agent/     Electron tray app (capture, WebRTC host, signaling, input)
│   │   ├── native/        InputHelper.cs → compiled to resources/input-helper.exe
│   │   └── src/{main,preload,renderer}
│   └── mobile/            React Native + Expo Router Android app
│       ├── app/           routes (connect screen, remote screen)
│       ├── features/      feature-scoped components (connection, remote)
│       └── services/      signaling, webrtc, input
├── packages/
│   └── protocol/          shared Zod schemas + types for every message
├── docs/                  USER_GUIDE.md, BUILD.md
├── PLAN.md                the full implementation plan
└── perch.apk      latest built Android app
```

## Roadmap

Not built yet, roughly in priority order:

- **Persistent device pairing** — the PIN protects each session, but pairing keys (so a trusted phone reconnects without re-entering the PIN, and can be revoked) are still to come.
- **Internet access via Tailscale** — use it away from home / on mobile data.
- **Paste from phone** — send phone clipboard text into a laptop field.
- **Connection-quality indicator** — live fps / latency on the phone.
- **Desktop audio** — stream system sound (needs Windows loopback capture).
- **Pairing & reconnection hardening** — device keys, auto-reconnect on network change.
- **Packaging** — Windows installer, start-with-Windows, signed APK.

## Security notes

- **Pairing PIN**: the agent shows a 6-digit PIN in its window (persisted across restarts). A phone must present it to connect, and only an authenticated connection can start or take over a session. This keeps a random LAN device from controlling the machine.
- Plain `ws://` signaling is acceptable **only** because it stays on your LAN. Do not expose port `43120` to the internet; the internet path will use `wss://` + Tailscale.
- The agent injects input at your normal user privilege. It cannot control the lock screen, UAC prompts, or apps running as Administrator. Keep the laptop **awake and unlocked** during a session.

## License

Personal project; no license granted yet.
