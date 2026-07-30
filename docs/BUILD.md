# Build & Developer Guide

How to build both apps from source, how the system is put together, and the environment gotchas that will bite you if you don't know them. This is a **pnpm monorepo** with an Electron desktop app and an Expo (React Native) Android app sharing a TypeScript protocol package.

## Contents

1. [Prerequisites](#1-prerequisites)
2. [First-time install](#2-first-time-install)
3. [Build & run the desktop agent](#3-build--run-the-desktop-agent)
4. [Build the Android app](#4-build-the-android-app)
5. [Architecture](#5-architecture)
6. [Environment gotchas (read this)](#6-environment-gotchas-read-this)
7. [Troubleshooting the build](#7-troubleshooting-the-build)

---

## 1. Prerequisites

**Common**
- **Node.js 22+**
- **pnpm 9+**. If `corepack` errors on this machine, install pnpm directly:
  ```bash
  npm install -g pnpm@9 --force
  ```

**Desktop agent (Windows)**
- Windows 10/11.
- **.NET Framework C# compiler** (`csc.exe`) for the native input helper. It ships with Windows at
  `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe` (no install needed).

**Android app**
- **Android Studio** / Android SDK, with **platform-tools** (`adb`) on your PATH.
- **JDK 17+** (JDK 21 is fine).
- **Android NDK 27** (`27.1.12297006`). Install via Android Studio's SDK Manager. The build is pinned to it.
- A physical device (USB debugging on) or an emulator.

## 2. First-time install

From the repo root:

```bash
pnpm install
```

This respects `.npmrc` (`node-linker=hoisted`), which produces a **flat** `node_modules`. This is required, not optional; see [gotchas](#6-environment-gotchas-read-this).

## 3. Build & run the desktop agent

**a. Compile the native input helper** (once, and whenever `native/InputHelper.cs` changes):

```bash
cd apps/desktop-agent
pnpm build:native
```

If `csc` isn't on your PATH, run it explicitly:

```bash
"C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe" -nologo -optimize \
  -out:resources/input-helper.exe -reference:System.Web.Extensions.dll native/InputHelper.cs
```

This produces `apps/desktop-agent/resources/input-helper.exe`.

**b. Run the agent (development):**

```bash
pnpm dev      # from apps/desktop-agent
```

The Electron window opens and the tray icon appears. `Start capture preview` in the window streams your screen back to itself, a quick local sanity check.

> **Gotcha:** if launched from a terminal that sets `ELECTRON_RUN_AS_NODE` (e.g. VS Code's integrated terminal), Electron crashes with `Cannot read properties of undefined (reading 'whenReady')`. Clear the variable for the launch:
> ```bash
> env -u ELECTRON_RUN_AS_NODE pnpm dev      # bash
> ```

**c. Package the desktop app (double-clickable exe):**

```bash
pnpm dist            # electron-vite build + electron-builder --dir
```

Output: `apps/desktop-agent/release/win-unpacked/Perch.exe`, the runnable app. It's portable: copy the whole `win-unpacked` folder anywhere and run `Perch.exe`.

**Optional NSIS installer:**

```bash
pnpm dist:installer  # produces release/Perch Setup <version>.exe + a portable exe
```

> **Gotcha (installer only):** electron-builder extracts a `winCodeSign` cache containing macOS symlinks; Windows blocks symlink creation without privilege, so `dist:installer` fails with `Cannot create symbolic link … A required privilege is not held`. The plain `pnpm dist` (`--dir`) build is unaffected. To build the installer, first enable **Windows Developer Mode** (Settings → Privacy & security → For developers) or run from an **Administrator** terminal.

The app is unsigned (no code-signing certificate), so SmartScreen may warn on first launch: choose "More info → Run anyway". Signing is a distribution step, not needed for personal use.

## 4. Build the Android app

**a. Generate the native project** (first time, and after changing `app.json` or adding native deps):

```bash
cd apps/mobile
npx expo prebuild --platform android --no-install
```

This regenerates `android/`. Two project-specific config plugins re-apply automatically:
- `plugins/withMonorepoBundleRoot.js`: points the Gradle JS bundle root at the workspace root.
- the workspace-root `app.json` sets `extra.router.root` so expo-router finds the routes.

**b. Build the APK.** You **must** set `EXPO_USE_METRO_WORKSPACE_ROOT=1` for the release JS bundle to resolve in this monorepo:

```bash
cd android
EXPO_USE_METRO_WORKSPACE_ROOT=1 ./gradlew.bat assembleRelease
```

The APK lands at `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`.

**c. Install it:**

```bash
adb install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

**Development loop (hot reload):** instead of a release build, run a dev build:

```bash
cd apps/mobile
npx expo run:android          # installs a dev client + starts Metro
```

## 5. Architecture

### Message flow

1. Phone opens a **WebSocket** to the agent (`ws://<laptop>:43120`) and sends `auth.request`. The agent replies with a random `sessionId`.
2. The agent (WebRTC **host**) captures the monitor, creates an `RTCPeerConnection`, adds the video track and two data channels, and sends an **offer** over the WebSocket.
3. The phone answers; ICE candidates are exchanged over the WebSocket; the direct WebRTC link comes up (LAN host candidates, no TURN).
4. Video flows over WebRTC. Input flows over the data channels.

### The two data channels

- `reliable-control` (ordered): clicks, key presses, text, shortcuts, session/capture commands.
- `pointer-control` (unordered, `maxRetransmits: 0`): the high-rate move/scroll stream, where a dropped stale packet is better than head-of-line blocking.

Pointer moves are coalesced on the phone to ~60/s. Scroll gestures send a final delta on the reliable channel so they never end short.

### Input injection

Control messages are validated against the shared Zod schemas (`packages/protocol`) **in the renderer**, then forwarded to the main process, which writes them as JSON lines to `input-helper.exe`'s stdin. The helper calls Windows `SendInput`:

- Absolute moves/clicks map normalized `0..1` coords to the primary monitor's `0..65535` space, or, for a non-primary monitor, into that monitor's bounds across the **virtual desktop** (`MOUSEEVENTF_VIRTUALDESK`).
- Typing uses Unicode injection; shortcuts and special keys use virtual-key codes.

### Coordinate mapping (phone side)

The phone owns all display transforms. A touch is un-projected through the current **zoom/pan** transform, then through the video's **letterbox** rectangle (computed from the capture resolution the desktop reports in `capture.info`), producing normalized `0..1` coords. Only those cross the wire, so the desktop stays simple.

### Key files

| Path | Role |
|---|---|
| `packages/protocol/src/schemas.ts` | Zod schemas for every message (validation on both sides) |
| `apps/desktop-agent/src/main/signaling.ts` | WebSocket signaling, single-controller with takeover |
| `apps/desktop-agent/src/main/index.ts` | monitor enumeration, IPC, session lifecycle |
| `apps/desktop-agent/src/main/input-controller.ts` | spawns and feeds the native helper |
| `apps/desktop-agent/native/InputHelper.cs` | `SendInput` injection |
| `apps/desktop-agent/src/renderer/src/rtc-host.ts` | WebRTC host, capture, monitor switching |
| `apps/mobile/store/sessionStore.ts` | connection state machine (zustand) |
| `apps/mobile/services/{signaling,webrtc,input}.ts` | phone-side signaling, peer, input senders |
| `apps/mobile/features/remote/components/ControlSurface.tsx` | gestures, zoom/pan, coordinate remap |

## 6. Environment gotchas (read this)

These are non-obvious and already handled in the repo; understand them before changing the build.

- **pnpm flat layout is mandatory** (`.npmrc` → `node-linker=hoisted`). The default nested `.pnpm` layout breaks the Android build two ways on Windows: the deeply-nested paths exceed the 260-char limit during the new-architecture C++ compile, and Metro can't resolve the hoisted `expo-router/entry`. The flat layout fixes both.
- **`EXPO_USE_METRO_WORKSPACE_ROOT=1`** must be set for `assembleRelease`, so Metro's server root is the workspace root (where the hoisted `node_modules` lives).
- **Bundle root + router root.** Because the bundle runs from the workspace root, `withMonorepoBundleRoot` sets Gradle's `react { root }` there, and the **workspace-root `app.json`** sets `extra.router.root = "apps/mobile/app"` so expo-router still finds the routes. Both must exist together.
- **NDK 27 pin.** RN 0.81 / SDK 54 build against NDK 27. A broken/partial NDK install fails with `did not have a source.properties file`; remove the bad NDK folder and install `27.1.12297006`.
- **`ELECTRON_RUN_AS_NODE`** must be unset when launching the agent (see §3b).
- **New Architecture is on** (`newArchEnabled: true`); native modules (`react-native-svg`, gesture-handler, screens) compile C++ at build time, so adding one triggers a longer native build.

## 7. Troubleshooting the build

| Symptom | Cause / fix |
|---|---|
| `[CXX1101] NDK … did not have a source.properties file` | Bad NDK. Delete that NDK folder, install `27.1.12297006`. |
| `Unable to resolve module …/expo-router/entry.js from D:\…\.` | Missing workspace-root config. Ensure `EXPO_USE_METRO_WORKSPACE_ROOT=1`, the `withMonorepoBundleRoot` plugin, and the workspace-root `app.json` are all present. |
| App crashes on launch with **"No routes found"** | expo-router looked in the wrong folder. Confirm the workspace-root `app.json` has `extra.router.root: "apps/mobile/app"`. |
| `The required package 'expo-asset' cannot be found` | Run `pnpm install`; ensure the flat `.npmrc` is in place. |
| `[CXX1428] … prefab_command.bat …` | Windows path length. You're on the nested pnpm layout; switch to `node-linker=hoisted` and reinstall. |
| `EPERM: operation not permitted, rename …` during install | A `node`/`java` process holds a lock. Kill them and re-run `pnpm install`. |
| Agent: `Cannot read properties of undefined (reading 'whenReady')` | `ELECTRON_RUN_AS_NODE` is set. Launch with `env -u ELECTRON_RUN_AS_NODE`. |
| Agent: `EADDRINUSE :43120` | A previous agent is still running. Kill stray `electron.exe` for this project. |
| `csc … could not be opened` | Use forward-slash-free absolute Windows paths, or run the full `csc.exe` path from §3a. |
| Helper won't recompile: `file is being used by another process` | The running agent holds `input-helper.exe`. Stop the agent (and any `input-helper.exe`) first. |
