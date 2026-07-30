# Perch

Perch lets you view and control a Windows desktop from an Android phone over a local network. It streams the selected monitor with WebRTC and sends touch, pointer, scroll, keyboard, and shortcut input back to Windows.

It was built for continuing an existing desktop workflow (such as a VS Code, Codex, or Claude session) from elsewhere in the house. Perch controls the whole desktop rather than a single application.

> **Status:** functional local-network MVP. Streaming, trackpad and direct-touch input, pinch zoom, keyboard forwarding, shortcuts, live monitor switching, PIN authentication, Android release builds, and portable Windows packaging are implemented.

## Features

- Direct LAN communication with no hosted relay or cloud account.
- WebRTC desktop streaming at up to 1080p and approximately 15 fps.
- Trackpad and direct-touch control modes.
- Tap, double-tap, long-press, drag, and two-finger scrolling.
- Pinch-to-zoom up to 5x, panning, and zoom reset.
- Android keyboard forwarding with a visible compose bar.
- Shortcut controls for Esc, Tab, Enter, arrows, Ctrl+P, Ctrl+Shift+P, and more.
- Multiple-monitor discovery and switching, including display changes during a session.
- Six-digit PIN authentication before a controller can start or replace a session.
- Shared Zod validation for signaling and control messages.
- Separate reliable and low-latency WebRTC data channels.
- Native Windows input injection through `SendInput`.
- Portable Windows packaging through Electron Builder.

## Supported platforms

| Component | Platform |
|---|---|
| Desktop agent | Windows 10 or Windows 11 |
| Mobile controller | Android 7.0 or newer (API 24+) |
| Network | Trusted local Wi-Fi or Ethernet LAN |

iOS, browser control, internet relaying, and macOS/Linux desktop hosts are not currently supported.

## Documentation

- [User Guide](docs/USER_GUIDE.md): installation, pairing, controls, and troubleshooting.
- [Build and Developer Guide](docs/BUILD.md): prerequisites, builds, packaging, architecture, and troubleshooting.
- [Implementation Plan](PLAN.md): original design and longer-term direction.

## Architecture

```text
+----------------------------+          Local network          +-----------------------+
| Windows computer           |                                 | Android phone         |
|                            |  WebRTC video ----------------> |                       |
| Perch desktop agent        |                                 | Perch mobile app      |
| - Electron main process    | <------- control channels ----- | - Remote video        |
| - Desktop capture          |                                 | - Touch/trackpad       |
| - WebRTC host              | <---- WebSocket signaling ----> | - Keyboard/shortcuts  |
| - input-helper.exe         |                                 | - Monitor selector    |
|      -> Windows SendInput  |                                 |                       |
+----------------------------+                                 +-----------------------+
```

The desktop agent listens on TCP port `43120`. The phone authenticates with the PIN displayed by the agent. The desktop then captures a monitor, creates a WebRTC offer, and exchanges SDP and ICE data with the phone over WebSocket signaling. Video travels to the phone over WebRTC, while input returns over two data channels:

- `reliable-control` carries clicks, buttons, keyboard input, shortcuts, final scroll deltas, and capture commands.
- `pointer-control` is unordered with no retransmission and carries high-frequency pointer and intermediate scroll movement.

Every control message includes the active session ID. Shared Zod schemas validate messages before they reach the native Windows input helper.

## Quick start

### Start the Windows agent

Run `Perch.exe` from the complete portable `win-unpacked` directory, or start from source:

```powershell
pnpm install
pnpm dev:desktop
```

The agent displays its listening status, pairing PIN, controller state, keep-awake setting, and a local capture preview.

### Allow the LAN connection

Run once from an Administrator PowerShell:

```powershell
New-NetFirewallRule `
  -DisplayName "Perch Agent" `
  -Direction Inbound `
  -LocalPort 43120 `
  -Protocol TCP `
  -Action Allow
```

Scope the rule to your private network or local subnet when possible.

### Connect from Android

1. Install an APK from a trusted release or local build.
2. Put the phone and computer on the same trusted network.
3. Open Perch and enter the computer's IPv4 address, port `43120`, and the displayed PIN.
4. Tap **Connect**.

Run `ipconfig` on Windows to find the active adapter's IPv4 address.

## Controls

| Gesture | Trackpad mode | Touch mode |
|---|---|---|
| One-finger drag | Move cursor relatively | Move cursor to touched position |
| Tap | Left-click at cursor | Left-click touched position |
| Double-tap | Double-click at cursor | Double-click touched position |
| Long-press | Right-click at cursor | Right-click touched position |
| Two-finger drag | Scroll | Scroll |
| Pinch | Zoom video | Zoom video |
| Drag while zoomed | Pan video | Pan video |

The monitor button appears when multiple displays are available. The keyboard button opens the compose bar and shortcut strip. The red power button disconnects immediately.

## Repository structure

```text
mobile-remote/
|-- apps/
|   |-- desktop-agent/
|   |   |-- native/                 # C# SendInput helper
|   |   |-- resources/              # Icons and compiled helper
|   |   `-- src/
|   |       |-- main/                # Electron lifecycle, signaling, IPC
|   |       |-- preload/             # Restricted renderer bridge
|   |       `-- renderer/            # Desktop UI and WebRTC host
|   `-- mobile/
|       |-- app/                     # Expo Router screens
|       |-- features/                # Connection and remote UI
|       |-- services/                # Signaling, WebRTC, input
|       `-- store/                   # Session state machine
|-- packages/protocol/               # Shared schemas, types, constants
|-- docs/                            # User and developer guides
|-- PLAN.md
`-- pnpm-workspace.yaml
```

Generated APKs, signature sidecars, native Android projects, signing keys, dependencies, and packaged desktop builds are excluded from Git.

## Development

### Requirements

- Node.js 22+
- pnpm 9+
- Windows 10/11
- .NET Framework C# compiler
- Android Studio and Android SDK
- JDK 17+
- Android NDK `27.1.12297006`

### Common commands

Run from the repository root:

```powershell
pnpm install
pnpm dev:desktop       # Start the Electron agent
pnpm build:desktop     # Build Electron bundles
pnpm typecheck         # Type-check all workspaces
pnpm test              # Run Vitest tests
```

Build the native helper and portable desktop application:

```powershell
pnpm --filter perch-agent build:native
pnpm --filter perch-agent dist
```

The portable executable is written to:

```text
apps/desktop-agent/release/win-unpacked/Perch.exe
```

Build the optional installer and portable artifact:

```powershell
pnpm --filter perch-agent dist:installer
```

The Windows executable is not Authenticode-signed, so SmartScreen may warn on first launch.

### Android

Generate and run the native Android project:

```powershell
cd apps/mobile
pnpm prebuild
pnpm android
```

Build a release APK:

```powershell
cd apps/mobile/android
$env:EXPO_USE_METRO_WORKSPACE_ROOT = "1"
./gradlew.bat assembleRelease
```

The Android project and signing material are ignored. Keep the release keystore private and back it up securely; future Android updates must use the same key. See [docs/BUILD.md](docs/BUILD.md) for complete build details.

## Security model

Perch controls an unlocked Windows session, so its network boundary matters.

- Authentication is required before a socket can start or replace a session.
- Failed PIN attempts are rate-limited by source IP.
- Unauthenticated WebSocket payloads are size-limited.
- Session UUIDs bind signaling and input to the active session.
- Electron uses context isolation, sandboxing, and a narrow preload API.
- Control messages are schema-validated before native input injection.
- Input runs with the current user's privileges and cannot control UAC prompts, the lock screen, or elevated applications.

Current security limitations:

- Signaling uses plain `ws://`; an attacker who can monitor the LAN could observe the PIN.
- The PIN persists until its local data file is removed.
- Perch is intended only for a trusted private network.
- Port `43120` must never be forwarded directly to the public internet.

## Artifact policy

Do not commit APKs, `.idsig` files, release keystores, `.env` files, native generated projects, dependencies, or packaged builds. Publish installers through a release page or artifact store, and store the Android signing key separately.

## Known limitations and roadmap

- Automatic reconnection after network changes.
- Persistent trusted-device identities and revocation.
- Tailscale-based remote access with encrypted signaling.
- Phone-to-desktop clipboard synchronization.
- Live latency, bitrate, and frame-rate diagnostics.
- Windows loopback audio.
- Signed Windows installer and automated releases.
- Better pointer mapping across monitors with mixed display scaling.

## Testing

Tests currently cover protocol schema validation, normalized coordinate mapping, and video letterbox calculations.

Run before committing:

```powershell
pnpm typecheck
pnpm test
pnpm build:desktop
```

Physical-device testing is still required for WebRTC streaming, gestures, monitor switching, Android keyboard behavior, and Windows input injection.

## License

This is a personal project. No open-source license has been granted. Until one is added, the source is viewable but not automatically licensed for reuse, modification, or redistribution.
