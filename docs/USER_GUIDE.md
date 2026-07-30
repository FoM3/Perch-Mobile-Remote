# User Guide

How to connect your phone to your laptop and use every control. This assumes the **desktop agent is already installed** on the laptop. If it isn't, follow the [Build Guide](BUILD.md) first (a one-time setup).

## Contents

1. [Before you start](#1-before-you-start)
2. [One-time laptop setup](#2-one-time-laptop-setup)
3. [Install the app on your phone](#3-install-the-app-on-your-phone)
4. [Connect](#4-connect)
5. [Using the controls](#5-using-the-controls)
6. [Multi-monitor](#6-multi-monitor)
7. [Typing](#7-typing)
8. [Disconnecting](#8-disconnecting)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Before you start

You need:

- A **Windows 10/11 laptop** with the Perch Agent installed.
- An **Android phone**.
- Both devices on the **same Wi-Fi network**.
- The laptop must stay **powered on, awake, and unlocked** while you use it remotely. (It cannot control the Windows lock screen.)

It uses **no mobile data** and **no internet**: all traffic stays on your local Wi-Fi.

## 2. One-time laptop setup

**a. Start the agent.** Launch **Perch Agent**. A window opens; confirm it shows:

```text
Signaling server: Listening on 0.0.0.0:43120
```

Closing that window keeps the agent running in the system tray. Quit it from the tray icon.

**b. Allow the firewall (once).** Windows blocks the phone's connection by default. Open **PowerShell as Administrator** and run:

```powershell
New-NetFirewallRule -DisplayName "Perch Agent" -Direction Inbound -LocalPort 43120 -Protocol TCP -Action Allow
```

**c. Find the laptop's IP address.** Open a terminal and run:

```powershell
ipconfig
```

Look for your active adapter (the Wi-Fi one, or Ethernet if wired) and note its **IPv4 Address**, for example `192.168.1.20`. You'll type this into the phone.

**d. Keep the laptop awake.** Turn on the agent's **Keep computer awake** option (tray menu or main window), and set Windows to not sleep or lock while you're away, otherwise the stream stops.

## 3. Install the app on your phone

You have the file `perch.apk`.

- **Easiest:** copy it to the phone (USB, Google Drive, or email), tap it, allow "install from unknown sources" when prompted, and install.
- **Via USB (developer):** with USB debugging on, run `adb install -r perch.apk` from the laptop.

Then open **Perch** from your app drawer (the coral bird on a blue icon).

## 4. Connect

1. Make sure the phone is on the **same Wi-Fi** as the laptop.
2. On the connect screen, enter:
   - **Laptop IP address**: the IPv4 you found (e.g. `192.168.1.20`).
   - **Port**: `43120` (default).
   - **Pairing PIN**: the 6-digit number shown on the Perch window on the laptop (the orange "Pairing PIN" card). This proves you can see the laptop, so a random device on the network can't connect.
3. Tap **Connect**.

Within a second or two you should see your desktop. The app rotates to landscape for the remote view.

> The PIN is fixed for your laptop (it persists across restarts). If connecting fails with "Incorrect PIN," re-check the number on the laptop window.

## 5. Using the controls

The floating round buttons on the **left** are your controls. The desktop fills the rest of the screen.

### Two pointer modes (toggle with the top-left button)

| | **Trackpad mode** (mouse icon) | **Touch mode** (pointer icon) |
|---|---|---|
| Move cursor | drag one finger (like a laptop trackpad) | n/a |
| Click | tap anywhere | tap lands exactly where you touch |
| Right-click | long-press | long-press |
| Double-click | double-tap | double-tap |

Trackpad mode is best for precise work; Touch mode is fastest for "tap that button."

### Gestures that work in both modes

- **Scroll**: drag with **two fingers** (works at any zoom).
- **Zoom in**: **pinch** two fingers apart (up to 5×). Great for reading code or the Claude panel.
- **Pan while zoomed**: drag with **one finger** to move around the zoomed view.
- **Reset zoom**: tap the **"1.8× · Reset"** badge that appears at the bottom-left when zoomed.

## 6. Multi-monitor

If the laptop has more than one monitor, a **Monitor** button appears in the left stack, labeled like `M1/2` (current screen / total).

- **Tap it to cycle** to the next screen. The view switches without disconnecting.
- Clicks are mapped to whichever monitor you're viewing, so tapping still lands correctly.
- Plugging in or unplugging a monitor **during** a session updates the button automatically; no reconnect needed.

If there's only one monitor, this button is hidden.

> Clicks on a second monitor are accurate as long as both displays use the **same Windows display scaling**. If a tap lands offset on the second screen, set both monitors to the same scale (Settings → Display → Scale).

## 7. Typing

1. Tap the **keyboard** button (left stack). The phone keyboard opens, with a **compose bar** just above it.
2. Type into the compose bar. What you type appears there **and** is sent to whatever field is focused on the laptop, live.
3. Above the compose bar is a **shortcut strip**: Esc, Tab, Enter, Backspace, arrows, and combos like **Ctrl+P**, **Ctrl+Shift+P**, **Ctrl+`**, **Ctrl+Enter**, Ctrl+S/C/V/Z. Tap any to send it.
4. Press the keyboard's **Send/Enter** to send Enter to the laptop (e.g. submit a Claude prompt).
5. Tap the keyboard button again to close it.

Why a compose bar? When the keyboard is open it covers the laptop's input field in the video, so the compose bar lets you see what you're typing.

> Note: **Ctrl+V** pastes the *laptop's* clipboard, not the phone's. Sending phone clipboard text is a planned feature.

## 8. Disconnecting

- Tap the red **power** button (left stack) to end the session immediately.
- Or close the app. Input stops the moment you disconnect.

## 9. Troubleshooting

| Problem | Fix |
|---|---|
| **"Could not reach the desktop agent"** | Phone and laptop on the same Wi-Fi? Agent running and showing "Listening"? Firewall rule added (step 2b)? Correct IP (re-check `ipconfig`)? |
| **"Another controller is already connected"** | A stale session is holding the slot. Just tap **Connect** again; the newest connection takes over. If it persists, restart the agent. |
| **Connects, then "connecting failed"** | Usually transient; retry. If it always fails right after connecting, restart the agent and try again. |
| **Keyboard doesn't pop up** | Tap the keyboard button again. It mounts a fresh input each time, so a second tap reliably opens it. |
| **Clicks land in the wrong place on a second monitor** | Happens if your monitors use **different display scaling**. Set both to the same scale (Settings → Display → Scale) for accurate clicks. |
| **Cursor moves too fast/slow in Trackpad mode** | Sensitivity is tuned to ~1.6×; ask the developer to adjust if needed. |
| **Stream freezes when you walk away** | The laptop slept or locked. Enable "Keep computer awake" and disable Windows idle lock/sleep. |
| **Text is unreadable** | Pinch to zoom in; use one finger to pan around. |
