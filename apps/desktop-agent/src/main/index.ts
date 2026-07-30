import { app, BrowserWindow, desktopCapturer, ipcMain, screen, session, shell } from "electron";
import { randomInt } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTray } from "./tray";
import { setKeepAwake, isKeepAwake } from "./keep-awake";
import { resourcePath } from "./resources";
import {
  startSignalingServer,
  getSignalingStatus,
  sendOffer,
  sendServerIce,
} from "./signaling";
import type { IceCandidatePayload } from "./signaling";
import {
  startInputController,
  setInputEnabled,
  injectInput,
  configureMonitor,
} from "./input-controller";

let agentWindow: BrowserWindow | null = null;
let quitting = false;
let rtcState = "idle";
let inputEventCount = 0;
// Pairing PIN; persisted so it stays stable across restarts
let accessPin = "";

function loadOrCreatePin(): string {
  const file = join(app.getPath("userData"), "perch-pin.txt");
  try {
    if (existsSync(file)) {
      const value = readFileSync(file, "utf8").trim();
      if (/^\d{6}$/.test(value)) return value;
    }
  } catch {
    // fall through to regenerate
  }
  const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
  try {
    writeFileSync(file, pin);
  } catch {
    // non-fatal; the PIN just won't persist
  }
  return pin;
}

function createAgentWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 980,
    height: 680,
    title: "Perch Agent",
    icon: resourcePath("icon.ico"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Tray app: closing the settings window hides it, it does not stop the agent
  win.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      win.hide();
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  // Surface renderer RTC-host logs in the agent's stdout for debugging
  win.webContents.on("console-message", (_event, _level, message) => {
    if (message.includes("[rtc-host]")) console.log(message);
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }
  return win;
}

function broadcastStatus(): void {
  agentWindow?.webContents.send("agent:status", buildStatus());
}

function buildStatus() {
  return {
    version: app.getVersion(),
    keepAwake: isKeepAwake(),
    signaling: getSignalingStatus(),
    rtcState,
    inputEventCount,
    pin: accessPin,
  };
}

interface MonitorInfo {
  index: number;
  sourceId: string;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  primary: boolean;
}

// Correlate capture sources with displays so we know each monitor's bounds
async function getMonitors(): Promise<MonitorInfo[]> {
  const sources = await desktopCapturer.getSources({ types: ["screen"] });
  const displays = screen.getAllDisplays();
  const primaryId = screen.getPrimaryDisplay().id;
  return sources.map((s, i) => {
    const disp =
      displays.find((d) => String(d.id) === s.display_id) ?? displays[i] ?? displays[0];
    return {
      index: i,
      sourceId: s.id,
      label: s.name || `Monitor ${i + 1}`,
      bounds: disp.bounds,
      primary: disp.id === primaryId,
    };
  });
}

async function getPrimaryScreenSourceId(): Promise<string | null> {
  const sources = await desktopCapturer.getSources({ types: ["screen"] });
  return sources[0]?.id ?? null;
}

app.setName("Perch");

app.whenReady().then(() => {
  accessPin = loadOrCreatePin();
  // Serve the primary monitor to any getDisplayMedia call from our own renderer
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({ types: ["screen"] })
      .then((sources) => callback({ video: sources[0] }))
      .catch(() => callback({}));
  });

  ipcMain.handle("agent:get-status", () => buildStatus());
  ipcMain.handle("agent:set-keep-awake", (_event, enabled: boolean) => {
    setKeepAwake(enabled === true);
    broadcastStatus();
    return isKeepAwake();
  });

  // WebRTC host lives in the renderer; main relays signaling both ways
  ipcMain.handle("rtc:primary-source-id", () => getPrimaryScreenSourceId());
  ipcMain.handle("rtc:list-monitors", async () => {
    const monitors = await getMonitors();
    console.log(`[monitors] capture sees ${monitors.length}: ${monitors.map((m) => m.label).join(" | ")}`);
    return monitors;
  });
  // Tell the input helper which monitor is active so clicks map correctly
  ipcMain.on("rtc:monitor-selected", (_event, index: number) => {
    void getMonitors().then((monitors) => {
      const m = monitors.find((x) => x.index === index) ?? monitors[0];
      if (m) {
        configureMonitor({
          primary: m.primary,
          x: m.bounds.x,
          y: m.bounds.y,
          width: m.bounds.width,
          height: m.bounds.height,
        });
      }
    });
  });
  ipcMain.on("rtc:offer", (_event, sessionId: string, sdp: string) => {
    sendOffer(sessionId, sdp);
  });
  ipcMain.on("rtc:ice", (_event, sessionId: string, candidate: IceCandidatePayload) => {
    sendServerIce(sessionId, candidate);
  });
  ipcMain.on("rtc:state", (_event, state: string) => {
    rtcState = state;
    console.log(`[rtc] connection state: ${state}`);
    broadcastStatus();
  });
  // Validated control messages arrive from the renderer's data channels
  startInputController();
  ipcMain.on("input:event", (_event, message: { type?: string }) => {
    injectInput(message);
    inputEventCount += 1;
    if (inputEventCount % 100 === 1) {
      console.log(`[input] injecting ${message?.type} (total ${inputEventCount})`);
    }
  });

  agentWindow = createAgentWindow();
  createTray({
    onOpenSettings: () => {
      agentWindow?.show();
      agentWindow?.focus();
    },
    onToggleKeepAwake: (enabled) => {
      setKeepAwake(enabled);
      broadcastStatus();
    },
    onQuit: () => {
      quitting = true;
      app.quit();
    },
  });

  // Re-enumerate and notify the phone when monitors are plugged in or removed
  const notifyDisplays = (): void => agentWindow?.webContents.send("rtc:displays-changed");
  screen.on("display-added", notifyDisplays);
  screen.on("display-removed", notifyDisplays);
  screen.on("display-metrics-changed", notifyDisplays);

  startSignalingServer({
    onStateChange: broadcastStatus,
    onSessionStart: (sessionId) => {
      inputEventCount = 0;
      setInputEnabled(true);
      agentWindow?.webContents.send("rtc:start", sessionId);
    },
    onAnswer: (sessionId, sdp) => {
      agentWindow?.webContents.send("rtc:answer", sessionId, sdp);
    },
    onRemoteIce: (sessionId, candidate) => {
      agentWindow?.webContents.send("rtc:remote-ice", sessionId, candidate);
    },
    onSessionEnd: () => {
      rtcState = "idle";
      setInputEnabled(false);
      agentWindow?.webContents.send("rtc:stop");
    },
    validateSecret: (secret) => secret === accessPin,
  });
});

// Keep running with no windows: the agent lives in the tray
app.on("window-all-closed", () => {});

app.on("before-quit", () => {
  quitting = true;
});
