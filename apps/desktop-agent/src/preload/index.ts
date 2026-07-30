import { contextBridge, ipcRenderer } from "electron";

export interface AgentStatus {
  version: string;
  keepAwake: boolean;
  signaling: {
    listening: boolean;
    host: string;
    port: number;
    clientConnected: boolean;
    sessionId: string | null;
  };
  rtcState: string;
  inputEventCount: number;
  pin: string;
}

export interface IceCandidatePayload {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

export interface MonitorInfo {
  index: number;
  sourceId: string;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  primary: boolean;
}

// Narrow, explicit bridge; no generic invoke or command execution is exposed
const agentApi = {
  getStatus: (): Promise<AgentStatus> => ipcRenderer.invoke("agent:get-status"),
  setKeepAwake: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke("agent:set-keep-awake", enabled),
  onStatus: (callback: (status: AgentStatus) => void): (() => void) => {
    const listener = (_event: unknown, status: AgentStatus): void => callback(status);
    ipcRenderer.on("agent:status", listener);
    return () => ipcRenderer.removeListener("agent:status", listener);
  },

  rtc: {
    getPrimarySourceId: (): Promise<string | null> =>
      ipcRenderer.invoke("rtc:primary-source-id"),
    listMonitors: (): Promise<MonitorInfo[]> => ipcRenderer.invoke("rtc:list-monitors"),
    reportMonitorSelected: (index: number): void => {
      ipcRenderer.send("rtc:monitor-selected", index);
    },
    sendOffer: (sessionId: string, sdp: string): void => {
      ipcRenderer.send("rtc:offer", sessionId, sdp);
    },
    sendIce: (sessionId: string, candidate: IceCandidatePayload): void => {
      ipcRenderer.send("rtc:ice", sessionId, candidate);
    },
    reportState: (state: string): void => {
      ipcRenderer.send("rtc:state", state);
    },
    reportInput: (message: unknown): void => {
      ipcRenderer.send("input:event", message);
    },
    onStart: (callback: (sessionId: string) => void): void => {
      ipcRenderer.on("rtc:start", (_event, sessionId: string) => callback(sessionId));
    },
    onAnswer: (callback: (sessionId: string, sdp: string) => void): void => {
      ipcRenderer.on("rtc:answer", (_event, sessionId: string, sdp: string) =>
        callback(sessionId, sdp),
      );
    },
    onRemoteIce: (
      callback: (sessionId: string, candidate: IceCandidatePayload) => void,
    ): void => {
      ipcRenderer.on("rtc:remote-ice", (_event, sessionId: string, candidate: IceCandidatePayload) =>
        callback(sessionId, candidate),
      );
    },
    onStop: (callback: () => void): void => {
      ipcRenderer.on("rtc:stop", () => callback());
    },
    onDisplaysChanged: (callback: () => void): void => {
      ipcRenderer.on("rtc:displays-changed", () => callback());
    },
  },
};

contextBridge.exposeInMainWorld("agentApi", agentApi);

export type AgentApi = typeof agentApi;
