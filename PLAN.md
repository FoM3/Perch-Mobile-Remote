# Remote Developer Control: MVP Implementation Plan (Final)

Consolidated plan incorporating the full review cycle: full-desktop capture, keep-awake as a Phase 1 constraint, phone-side coordinate contract, two-channel input design, codec verification, single-monitor first build, Paste from phone, and simplified replay protection.

---

## 1. Product goal

Build a mobile application that connects to a Windows laptop from another location and continues using the exact VS Code session already running on the laptop.

The user can:

* See the same VS Code window currently open on the laptop
* Continue an existing Codex or Claude extension conversation
* See commands that are still running
* Type prompts and approve actions
* Control the laptop from a phone
* Switch to other desktop windows when necessary
* Connect while the phone and laptop are on different networks

The phone does not run VS Code, Codex or Claude. It only displays and controls the laptop. Codex and Claude continue using the authentication, chat history, files and environment already on the laptop.

---

## 2. Core MVP decision

Capture the **entire desktop**, not a single application window. The phone opens with the view automatically zoomed to VS Code.

```text
Windows desktop
      ↓
Desktop capture
      ↓
WebRTC video stream
      ↓
Mobile application
      ↓
Automatically zoom to VS Code
```

The user zooms out whenever they need File Explorer, browser login windows, Windows permission dialogs, terminals, preview windows or other tools.

Why full-desktop capture wins over window capture:

* Native context menus, file dialogs and extension login browsers appear in the stream automatically; no fallback machinery is needed.
* Coordinate math simplifies to monitor-relative; window movement and resizing stop mattering.
* No foreground-focus forcing is required; clicks land where the user taps and Windows handles focus naturally.

The "VS Code view" is a client-side zoom preset, a UI convenience, not a security restriction.

---

## 3. Explicit MVP limitations

The MVP requires the laptop to remain:

* Powered on
* Connected to the internet
* Awake
* Unlocked
* Logged into Windows
* Running the desktop agent

The MVP will not control:

* The Windows lock screen
* Secure UAC prompts
* A laptop that is fully asleep or powered off

Neither capture nor `SendInput` works on the secure desktop. Real remote tools solve this with a Windows service and UIAccess; that is deliberately out of scope. The laptop must be configured not to sleep or auto-lock while remote access is enabled, and the agent enforces keep-awake (see section 13).

---

## 4. Phase 0: workflow validation with existing tools

Before building anything, test the workflow with off-the-shelf software:

* Tailscale on laptop and phone
* Sunshine on the laptop
* Moonlight on the phone

Use this setup for several days to learn:

* Whether phone control of VS Code is comfortable
* Whether direct-touch or trackpad mode works better
* Which keyboard shortcuts are frequently needed
* Whether landscape mode is required
* How much zoom is needed and whether 1080p text is readable
* How often full-desktop navigation is required
* What connection problems occur in real use

Deliverable: usability notes and confirmed MVP controls.

### Decision gate

Phase 0 must end with one of three conclusions:

```text
A. Sunshine + Moonlight is good enough
   → Do not rebuild streaming.

B. Streaming is good, but developer controls are missing
   → Build a thin companion app for shortcuts, notifications and approvals.

C. Existing streaming cannot provide the required experience
   → Proceed with the full custom WebRTC implementation below.
```

Option B is the most likely and most interesting outcome; it changes the technical shape substantially. A companion app for approvals, quick prompts and Git status does not inject input into a streamed desktop at all; it talks to a small agent or VS Code extension over an API. If Phase 0 lands on B, sections 9-12 of this plan are shelved, not adapted. Do not polish the input protocol until the gate is passed.

---

## 5. MVP scope

### Supported platforms

```text
Laptop: Windows 10 and Windows 11
Mobile: Android
Mobile framework: React Native
Desktop agent: Electron and TypeScript
Streaming: WebRTC
Private networking: Tailscale
Remote input: Windows SendInput
```

iOS, macOS and Linux come later.

### Included features

1. Desktop agent installer for Windows
2. Pairing one phone with one laptop
3. Connection through Tailscale
4. Full-desktop streaming (primary monitor)
5. Automatic VS Code focus on the mobile view
6. Pinch-to-zoom and pan
7. Trackpad-style mouse control
8. Direct-touch control
9. Keyboard input
10. Common VS Code shortcuts
11. Scrolling
12. Paste from phone (one-shot clipboard send)
13. Reconnection after network interruptions
14. Keep-awake while remote access is enabled
15. Visible remote-session indicator
16. Disconnect from either device

### Excluded from the MVP

* User accounts and subscription plans
* Public cloud relay and custom TURN infrastructure
* Multiple laptops or multiple phone users
* File transfer
* Continuous clipboard synchronization
* Remote audio, camera or microphone
* Wake-on-LAN
* Windows lock-screen or UAC secure-desktop control
* Voice commands
* AI-specific integrations
* App Store release and automatic updates
* Monitor switching (Phases 1-2 are primary monitor only; add in Phase 3 only if Phase 0 showed it is needed)

---

## 6. High-level architecture

```text
┌──────────────────────────────────────┐
│ Windows laptop                       │
│                                      │
│ VS Code                              │
│ ├── Codex extension                  │
│ ├── Claude extension                 │
│ ├── Existing conversations           │
│ └── Running commands                 │
│                                      │
│ Desktop agent                        │
│ ├── Captures desktop                 │
│ ├── Streams video through WebRTC     │
│ ├── Receives mobile input            │
│ ├── Injects mouse and keyboard input │
│ ├── Prevents sleep                   │
│ └── Handles pairing and sessions     │
└──────────────────┬───────────────────┘
                   │
             Tailscale network
                   │
┌──────────────────▼───────────────────┐
│ Android mobile application           │
│ ├── Displays desktop stream          │
│ ├── Starts focused on VS Code        │
│ ├── Supports zoom and pan            │
│ ├── Provides trackpad mode           │
│ ├── Provides keyboard controls       │
│ └── Sends input events               │
└──────────────────────────────────────┘
```

---

## 7. Technology stack

### Desktop agent

```text
Electron, TypeScript, Node.js
WebRTC, WebSocket
Rust or C++ input helper
electron-builder
Zod
```

Electron handles desktop capture, WebRTC, the tray application, packaging, the settings interface, the local signaling server and startup. The Rust/C++ helper handles mouse movement, clicks, scrolling, keyboard input, Unicode text and shortcuts.

### Mobile application

```text
React Native, TypeScript
react-native-webrtc
React Native Gesture Handler
React Navigation
Zustand
AsyncStorage
QR scanner (e.g. Vision Camera)
```

Use a React Native development build, not Expo Go: WebRTC requires native modules.

### Networking

```text
Phone and laptop
      ↓
Tailscale private network
      ↓
Direct WebRTC connection
```

Tailscale provides private device addressing, encryption, NAT traversal and survival of public-IP changes.

The MVP signaling server may use plain `ws://` **only because it operates inside the encrypted Tailscale network**. This assumption is documented here so it does not silently survive into a public version. A future public version must use `wss://`, HTTPS, TURN, end-to-end authentication and public relay infrastructure.

---

## 8. Repository structure

One pnpm monorepo so both apps share message types and Zod schemas.

```text
mobile-remote/
├── apps/
│   ├── desktop-agent/
│   │   ├── src/
│   │   │   ├── main/
│   │   │   │   ├── index.ts
│   │   │   │   ├── tray.ts
│   │   │   │   ├── signaling.ts
│   │   │   │   ├── session-manager.ts
│   │   │   │   ├── keep-awake.ts
│   │   │   │   ├── input-helper.ts
│   │   │   │   ├── pairing.ts
│   │   │   │   └── security.ts
│   │   │   ├── preload/
│   │   │   │   └── index.ts
│   │   │   └── renderer/
│   │   │       ├── App.tsx
│   │   │       ├── CaptureRenderer.tsx
│   │   │       ├── PairingScreen.tsx
│   │   │       ├── SettingsScreen.tsx
│   │   │       └── SessionStatus.tsx
│   │   └── package.json
│   │
│   └── mobile/
│       ├── src/
│       │   ├── screens/
│       │   │   ├── PairingScreen.tsx
│       │   │   ├── DeviceScreen.tsx
│       │   │   ├── RemoteScreen.tsx
│       │   │   └── SettingsScreen.tsx
│       │   ├── components/
│       │   │   ├── RemoteVideo.tsx
│       │   │   ├── Trackpad.tsx
│       │   │   ├── ShortcutBar.tsx
│       │   │   ├── ZoomControls.tsx
│       │   │   └── ConnectionStatus.tsx
│       │   ├── services/
│       │   │   ├── signaling.ts
│       │   │   ├── webrtc.ts
│       │   │   ├── pairing.ts
│       │   │   └── input.ts
│       │   └── store/
│       │       └── sessionStore.ts
│       └── package.json
│
├── packages/
│   ├── protocol/
│   │   ├── types.ts
│   │   ├── schemas.ts
│   │   └── events.ts
│   └── config/
│
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

---

## 9. Desktop-agent design

### 9.1 Electron process structure

Desktop capture and `getUserMedia` must run in an Electron renderer, so the tray app keeps a hidden capture-renderer window.

```text
Main process
      ↓
Creates hidden renderer window
      ↓
Renderer captures the desktop
      ↓
Renderer creates WebRTC media stream
```

Main process: tray menu, local WebSocket server, session management, pairing, native input helper, keep-awake state, startup, security decisions.

Renderer: desktop capture, media stream creation, WebRTC peer connection, video-track management, data-channel communication.

### 9.2 Tray application

```text
Remote Developer
├── Status: Ready
├── Remote access: Enabled
├── Connected device: None
├── Start session
├── Stop session
├── Keep computer awake
├── Start with Windows
├── Open settings
└── Quit
```

Closing the settings window must not close the agent.

### 9.3 Desktop capture

Capture the complete primary monitor:

```ts
const sources = await desktopCapturer.getSources({
  types: ["screen"],
  thumbnailSize: { width: 320, height: 180 },
});
```

Phases 1-2 stream the primary monitor only. Monitor switching is deferred to Phase 3, and built only if Phase 0 showed it matters.

### 9.4 Capture quality

For text and development interfaces, clear text matters more than frame rate.

```text
Resolution: 1920 × 1080
Frame rate: 10-15 FPS
Audio: Disabled
Preferred codec: H.264 (hardware encode where supported)
Fallback codec: VP8
```

Quality presets:

```text
Low:    854 × 480,  10 FPS
Medium: 1280 × 720, 15 FPS
High:   1920 × 1080, 15 FPS
```

Start at high when the network allows. Reduce automatically when packet loss, latency or encoder load rises.

### 9.5 Codec negotiation and verification

Do not assume H.264 was selected just because it was requested. During streaming work (not deferred to optimization):

1. Read supported codecs.
2. Prefer H.264 via `setCodecPreferences` (or SDP munging where react-native-webrtc requires it).
3. Fall back to VP8.
4. After connecting, inspect `getStats` and confirm the codec actually in use.

A silent VP8 software fallback at 1080p is exactly the CPU/thermal problem to avoid. Record session diagnostics:

```text
Codec: H.264
Resolution: 1920 × 1080
Frame rate: 13 FPS
Encoder: Hardware
Packet loss: 1.2%
Round-trip time: 146 ms
```

### 9.6 WebRTC connection flow

The desktop is the WebRTC host.

1. Phone connects to the desktop signaling server
2. Devices authenticate
3. Desktop creates an `RTCPeerConnection`
4. Desktop adds the desktop video track
5. Desktop creates the two data channels (section 10.1)
6. Desktop sends the offer; phone returns the answer
7. ICE candidates are exchanged
8. Video streaming starts; input begins through the data channels

The WebSocket carries only pairing, authentication, offers, answers, ICE candidates, heartbeats and session control. Video and input use WebRTC.

---

## 10. Input design

### 10.1 Two data channels

Do not put all input on one channel; a single lost packet on an ordered channel head-of-line blocks every queued pointer move and the cursor rubber-bands on lossy mobile connections.

Reliable channel, for actions that must arrive in order:

```ts
const reliableChannel = peer.createDataChannel("reliable-control", {
  ordered: true,
});
```

Carries: clicks, button down/up, keyboard input, shortcuts, text input, session commands, capture commands, disconnect.

Fast channel, for events where stale packets are useless:

```ts
const pointerChannel = peer.createDataChannel("pointer-control", {
  ordered: false,
  maxRetransmits: 0,
});
```

Carries: absolute pointer moves, trackpad deltas, scroll deltas.

The mobile app coalesces pointer movement to at most one update per rendered frame (about 60 per second).

Scroll caveat: losing deltas mid-gesture is fine, but a lost final delta leaves the view short of where the user expects. When a scroll gesture ends, send a terminal `pointer.scroll` on the reliable channel.

### 10.2 Coordinate contract

**Direct-touch mode: the phone owns all display transforms.**

```text
Phone touch
→ remove letterboxing
→ reverse pan offset
→ reverse zoom scale
→ convert to normalized full-frame coordinates
→ send normalized x/y
```

Only normalized full-frame coordinates cross the network:

```json
{ "type": "pointer.absolute", "x": 0.42, "y": 0.61 }
```

The desktop agent stays simple and knows nothing about phone zoom, pan or orientation:

```text
desktopX = normalizedX × monitorWidth
desktopY = normalizedY × monitorHeight
```

**Trackpad mode: relative movement.**

```json
{ "type": "pointer.relative", "deltaX": 12, "deltaY": -4 }
```

Delta units are **desktop pixels after a phone-side sensitivity multiplier**; sensitivity tuning lives entirely in the app settings and the desktop agent stays dumb. Scroll deltas have one documented conversion in the input helper (`SendInput` wheel input wants multiples of `WHEEL_DELTA`).

```text
Direct touch → absolute position
Trackpad     → relative movement
```

### 10.3 Drag sequence

A touch drag is:

```text
pointer.button down   (reliable channel)
pointer.absolute ...  (fast channel, streamed)
pointer.button up     (reliable channel)
```

The hazard is the unreliable move stream racing the reliable button-up. The desktop agent applies button-up only after applying the last pointer position it has received, and tolerates moves that arrive after the release.

### 10.4 Input helper

A separate Rust or C++ process, communicating with Electron over stdin/stdout or a local named pipe. The child-process approach is preferred over a Node native addon for the MVP: easier to debug and isolate.

Supported operations:

```text
mouse.move  mouse.click  mouse.doubleClick
mouse.buttonDown  mouse.buttonUp  mouse.scroll
keyboard.keyDown  keyboard.keyUp
keyboard.text  keyboard.shortcut
```

The helper converts events into Windows `INPUT` structures for `SendInput`. Use Unicode text injection (`KEYEVENTF_UNICODE`) for normal typing and virtual-key events for shortcuts, arrows, Escape and function keys.

### 10.5 Focus behavior

Do not force VS Code into the foreground before clicks. Stream the actual desktop, send the click where the user tapped, and let Windows handle focus. This avoids Windows foreground-lock complications entirely.

### 10.6 Input limitations

No support for the lock screen, secure UAC prompts, higher-integrity applications or the secure desktop. Run VS Code and the agent at the same privilege level, normally both without administrator rights. Warn when VS Code is elevated and the agent is not.

---

## 11. Mobile application design

### 11.1 Pairing

The desktop generates a QR code (a separate six-digit code is unnecessary):

```json
{
  "version": 1,
  "host": "100.x.x.x",
  "port": 43120,
  "pairingToken": "temporary-token"
}
```

The phone scans it; the desktop shows an approval dialog:

```text
New device requesting access
Device: Samsung Galaxy
[Approve]  [Reject]
```

After approval: phone creates a device key pair, each side stores the other's public key, the token expires immediately, and future sessions use device credentials.

### 11.2 Device screen

```text
My Laptop
Status: Online
Remote access: Enabled
VS Code: Running
Connection: Tailscale
[Connect]
```

Shows laptop name, online status, agent version, Tailscale address, session status and keep-awake status.

### 11.3 Remote-control screen

Opens in landscape by default.

```text
┌────────────────────────────────────┐
│ Good connection        1080p       │
├────────────────────────────────────┤
│         Desktop video              │
│      Focused on VS Code            │
├────────────────────────────────────┤
│ Ctrl Alt Shift Esc Tab Enter       │
├────────────────────────────────────┤
│ Keyboard Trackpad Zoom Paste       │
└────────────────────────────────────┘
```

### 11.4 VS Code-focused view

On session start the agent reports the approximate VS Code window rectangle; the app applies an initial zoom and pan so VS Code fills the screen. The user can zoom out at any time. This is a UI convenience, not a restriction.

### 11.5 Zoom and pan

Required in the first usable build, not a later phase: VS Code text on a phone is unusable without it.

* Pinch to zoom, one-finger pan while zoomed, double-tap to zoom
* Reset view, fit desktop, focus VS Code
* Zoom only changes phone-side display, never desktop resolution

### 11.6 Trackpad mode (default precision mode)

```text
One-finger movement → move pointer
Single tap          → left-click
Double tap          → double-click
Long press          → right-click
Two-finger swipe    → scroll
Tap and drag        → drag item
```

### 11.7 Direct-touch mode

```text
Tap location     → click location
Double tap       → double-click
Long press       → right-click
Drag             → mouse drag
Two-finger swipe → scroll
```

The user can switch modes at any time.

### 11.8 Keyboard controls

Normal typing uses `keyboard.text`; special keys use `keyboard.keyDown` / `keyboard.keyUp` / `keyboard.shortcut`.

Shortcut bar:

```text
Ctrl  Alt  Shift  Esc  Tab  Enter  Backspace  Arrows
Ctrl+P  Ctrl+Shift+P  Ctrl+`  Ctrl+Enter
Ctrl+S  Ctrl+C  Ctrl+V  Ctrl+Z
```

Note: Ctrl+V pastes the laptop's clipboard, not the phone's; that is what "Paste from phone" is for.

### 11.9 Paste from phone

Continuous clipboard sync stays out of scope, but the app includes a one-shot action:

1. User copies text on the phone.
2. App reads the phone clipboard after an explicit user action.
3. App sends the content as `keyboard.text`.
4. Desktop inserts it at the active cursor.

Covers the common cases: error messages, URLs, prompts, code snippets, ticket descriptions.

---

## 12. Shared protocol

Versioned messages, split by channel:

```ts
type ReliableControlMessage =
  | PointerClickMessage
  | PointerButtonMessage
  | KeyboardKeyMessage
  | KeyboardTextMessage
  | ShortcutMessage
  | SessionCommandMessage
  | CaptureCommandMessage;

type FastControlMessage =
  | AbsolutePointerMoveMessage
  | RelativePointerMoveMessage
  | ScrollDeltaMessage;
```

Examples:

```json
{
  "version": 1,
  "sessionId": "session-123",
  "type": "pointer.absolute",
  "payload": { "x": 0.42, "y": 0.61 }
}
```

```json
{
  "version": 1,
  "sessionId": "session-123",
  "type": "pointer.relative",
  "payload": { "deltaX": 11, "deltaY": -3 }
}
```

```json
{
  "version": 1,
  "sessionId": "session-123",
  "type": "keyboard.text",
  "payload": { "text": "Continue implementing the login flow" }
}
```

Validate every message with Zod. Reject:

* Unknown message types
* Invalid coordinates
* Oversized text payloads
* Messages for inactive sessions or wrong session IDs
* Events from unpaired devices
* Excessive input rates (mostly moot given phone-side coalescing)

Replay protection is deliberately simple: DTLS encryption, paired-device authentication, a random per-session ID included in every control message, and rejection of messages for inactive sessions. No sequence-number machinery.

---

## 13. Keep-awake

A Phase 1 feature, not a later improvement. While remote access is enabled the agent prevents display sleep, system sleep and idle suspension (Windows `SetThreadExecutionState`).

The desktop UI shows `Keep computer awake: Enabled` and warns:

```text
Remote access stops if Windows locks or the laptop sleeps.
```

The user must adjust Windows sign-in settings so automatic lock does not interrupt sessions. Do not attempt to bypass Windows security controls.

---

## 14. Connection state and reconnection

```text
DISCONNECTED → CONNECTING → AUTHENTICATING → SIGNALING → STREAMING
                                   ↑                          ↓
                                   └────── RECONNECTING ──────┘
```

Heartbeat every five seconds; disconnected after three misses.

On network change (Wi-Fi to mobile data):

1. Preserve session identity
2. Reconnect to the signaling server
3. Re-authenticate the paired device
4. Recreate the WebRTC peer connection
5. Resume desktop capture
6. Restore the previous zoom position when possible

VS Code, Codex and Claude keep running throughout.

---

## 15. Security requirements

### Pairing

* First pairing requires physical laptop approval
* QR token expires quickly and is single-use
* Only paired devices may connect; access is revocable
* Desktop shows the requesting device name
* One controlling phone at a time

### Session

* New random session ID per connection, echoed in every control message
* Visible remote-session indicator on the laptop
* Immediate disconnect from the tray plus an emergency local keyboard shortcut
* Input rejected after disconnect
* Never log typed text or passwords
* Codex and Claude credentials remain entirely outside this architecture; documented invariant, no feature required

### Electron

```ts
webPreferences: {
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  preload: preloadPath
}
```

Expose only narrow preload functions; no generic command execution; never load remote websites in the renderer.

### Network

Bind the signaling server to the Tailscale interface only (127.0.0.1 during early development). Never expose it to the public internet.

Note: input injection is desktop-global. Anyone who can inject input controls the whole machine; the paired-device boundary is the real security boundary, not any per-window view.

---

## 16. Delivery phases

### Phase 0: workflow validation

Sunshine + Moonlight + Tailscale for several days. Exit through the decision gate in section 4. Deliverable: usability notes, confirmed controls, and a build/no-build decision.

### Phase 1: local desktop streaming

Build: Electron tray app, hidden capture renderer, full-desktop capture, local WebRTC stream, basic Android receiver, 1080p display, pinch zoom, pan, keep-awake.

Accept: phone shows the desktop; text readable; zoom works; stream stable for 30+ minutes; laptop stays awake; rotation survives.

### Phase 2: basic input control

Build: input helper, two data channels, coordinate transform, mouse move/click/scroll, keyboard text, Enter/Escape/Backspace, Ctrl and Shift shortcuts.

Accept: open Codex or Claude, type and submit a prompt, scroll the response, approve an extension action, switch VS Code tabs.

### Phase 3: mobile interaction

Build: trackpad mode, direct-touch mode, shortcut bar, better keyboard handling, landscape layout, reset zoom, focus-VS-Code and fit-desktop buttons, Paste from phone. Monitor switching only if Phase 0 validated the need.

Accept: full VS Code control without touching the laptop; small UI targets selectable; code and AI output readable; full desktop reachable.

### Phase 4: different-network connection

Build: Tailscale binding, QR pairing with laptop approval, device keys, persistent pairing, heartbeats, reconnection, network-change recovery.

Accept: laptop on home Wi-Fi, phone on mobile data, connects with no port forwarding; reconnects after network changes; existing AI sessions stay alive.

### Phase 5: packaging

Build: Windows installer, Android APK, start-with-Windows, tray controls, device revocation, crash handling without sensitive content, local logs, settings screen.

Accept: agent starts after login; phone reconnects without re-pairing; closing settings does not stop the agent; disconnect immediately blocks input; uninstall is clean.

---

## 17. Testing plan

### Desktop

One monitor; multiple monitors present (streaming primary); 1080p/1440p/4K panels; Windows scaling 100/125/150%; VS Code minimized, maximized, moved between monitors; browser popups; file pickers; power settings; network loss; Windows lock (expected failure, verify graceful messaging); sleep (same); VS Code elevated while agent is not (verify warning).

### Mobile

Portrait and landscape; multiple screen sizes; keyboard open; both input modes; pinch zoom and maximum zoom; Wi-Fi, mobile data and the switch between them; background/resume; incoming call; weak network, high latency, packet loss.

### Security

Reuse expired pairing token; connect from unpaired device; invalid coordinates; malformed messages; wrong or stale session IDs; excessive input rates; connect after remote access disabled; connect after revocation; input after disconnect; simultaneous connections from two phones.

---

## 18. Performance targets

```text
Resolution: 1920 × 1080
Frame rate: 10-15 FPS
Interaction latency: below 250 ms
Codec: H.264 preferred, VP8 fallback
Audio: Off
Concurrent controllers: 1
Concurrent laptops: 1
```

Monitor: round-trip time, frame loss, packet loss, encoding time, CPU, memory, data-channel latency, reconnection count.

---

## 19. Major risks and mitigations

* **Laptop locks or sleeps** → keep-awake enabled, explicit warning, unlocked-laptop requirement, idle sleep disabled during remote mode.
* **Text hard to read** → 1080p at low FPS, pinch zoom, pan, landscape, focus-VS-Code button.
* **Software encoding overloads the laptop** → H.264 hardware encode preferred and verified via stats, quality presets, CPU monitoring, 720p fallback.
* **Inaccurate coordinates** → full-desktop capture, phone-owned transform, normalized coordinates, scaling-level tests.
* **Secure windows uncontrollable** → documented limitation, same privilege level, no UAC bypass attempts.
* **Inconsistent mobile keyboards** → Unicode text separated from special keys, shortcut buttons, trackpad mode, testing across Android keyboard apps.

---

## 20. Implementation order

```text
 1. Install and test Tailscale, Sunshine and Moonlight
 2. Use them for several days
 3. Record pain points and required controls
 4. Make the build/no-build decision (section 4 gate)
 5. Create Electron tray application
 6. Create hidden capture renderer
 7. Capture the primary desktop
 8. Add keep-awake
 9. Create Android React Native app
10. Receive the desktop video
11. Add pinch zoom and pan
12. Define the phone-side coordinate transform
13. Add reliable WebRTC data channel
14. Add fast unordered pointer channel
15. Build Windows input helper
16. Add direct-touch absolute input
17. Add trackpad relative input
18. Add click and scrolling (with terminal scroll on reliable channel)
19. Add keyboard and shortcut controls
20. Add Paste from phone
21. Add codec preference negotiation
22. Verify the active codec through WebRTC statistics
23. Add Tailscale connection
24. Add QR pairing and laptop approval
25. Add persistent device authentication
26. Add reconnection and heartbeat handling
27. Add monitor switching only if Phase 0 showed it is needed
28. Add Windows startup
29. Package Windows installer and Android APK
```

---

## 21. MVP acceptance test

The MVP is successful when this full scenario works:

```text
 1. VS Code is open on the Windows laptop.
 2. Codex or Claude is authenticated in VS Code.
 3. A task is running in the extension.
 4. The user leaves the laptop.
 5. The laptop remains awake and unlocked.
 6. The user switches the phone to mobile data.
 7. The user opens the mobile application.
 8. The application connects through Tailscale.
 9. The phone displays the same desktop.
10. The view automatically focuses on VS Code.
11. The user sees the same AI conversation.
12. The user types another prompt.
13. The user approves an action.
14. The extension continues working on the laptop.
15. The user returns to the laptop.
16. The same VS Code session remains open.
```

---

## 22. Product direction after the MVP

The first version is a remote desktop focused on developers. The long-term product becomes a developer companion; the streaming layer is one feature within it.

Future candidates:

* Notification when Codex or Claude needs approval
* AI session-status detection and quick approval buttons
* Git diff preview, branch info, test results, build status
* One-tap VS Code shortcuts and workspace switching
* Terminal summaries and mobile-friendly prompt history
* Voice prompts
* Multiple laptops, public relay, TURN fallback, end-to-end encrypted sessions
* iOS, macOS and Linux support

The differentiated value lives in these companion features, not in the video pipeline; this is why the Phase 0 gate (section 4) exists.
