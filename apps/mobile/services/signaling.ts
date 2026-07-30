import { PROTOCOL_VERSION } from "@mobile-remote/protocol";
import type { ServerSignalingMessage } from "@mobile-remote/protocol";

export interface IcePayload {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

export interface SignalingEvents {
  onOffer: (sdp: string) => void;
  onRemoteIce: (candidate: IcePayload) => void;
  onSessionEnded: (reason: string) => void;
  onClosed: () => void;
}

const HEARTBEAT_INTERVAL_MS = 5000;
const CONNECT_TIMEOUT_MS = 8000;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  sessionId: string | null = null;

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly events: SignalingEvents,
  ) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://${this.host}:${this.port}`);
      this.ws = ws;
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("Connection timed out"));
      }, CONNECT_TIMEOUT_MS);

      ws.onopen = () => {
        clearTimeout(timeout);
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("Could not reach the desktop agent"));
      };
      ws.onclose = () => {
        this.stopHeartbeat();
        this.events.onClosed();
      };
      ws.onmessage = (event) => this.handleMessage(event.data as string);
    });
  }

  authenticate(deviceName: string, secret: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Authentication timed out")), CONNECT_TIMEOUT_MS);
      this.authResolver = (sessionId) => {
        clearTimeout(timeout);
        this.sessionId = sessionId;
        this.startHeartbeat();
        resolve(sessionId);
      };
      this.authRejecter = (message) => {
        clearTimeout(timeout);
        reject(new Error(message));
      };
      this.send({
        version: PROTOCOL_VERSION,
        type: "auth.request",
        payload: { deviceId: deviceName, deviceName, secret },
      });
    });
  }

  sendAnswer(sdp: string): void {
    if (!this.sessionId) return;
    this.send({ version: PROTOCOL_VERSION, sessionId: this.sessionId, type: "webrtc.answer", payload: { sdp } });
  }

  sendIce(candidate: IcePayload): void {
    if (!this.sessionId) return;
    this.send({ version: PROTOCOL_VERSION, sessionId: this.sessionId, type: "webrtc.ice", payload: candidate });
  }

  close(): void {
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
    this.sessionId = null;
  }

  private authResolver: ((sessionId: string) => void) | null = null;
  private authRejecter: ((message: string) => void) | null = null;

  private send(message: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.sessionId) {
        this.send({
          version: PROTOCOL_VERSION,
          sessionId: this.sessionId,
          type: "heartbeat",
          payload: { timestamp: Date.now() },
        });
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private handleMessage(raw: string): void {
    let message: ServerSignalingMessage;
    try {
      message = JSON.parse(raw) as ServerSignalingMessage;
    } catch {
      return;
    }
    switch (message.type) {
      case "auth.result":
        if (message.payload.ok && message.payload.sessionId) {
          this.authResolver?.(message.payload.sessionId);
        } else {
          this.authRejecter?.("Incorrect PIN. Check the number shown on the laptop.");
        }
        break;
      case "webrtc.offer":
        this.events.onOffer(message.payload.sdp);
        break;
      case "webrtc.ice":
        this.events.onRemoteIce(message.payload);
        break;
      case "session.ended":
        this.events.onSessionEnded(message.payload.reason);
        break;
      case "error":
        if (message.payload.code === "busy") {
          this.authRejecter?.("Another controller is already connected");
        }
        break;
    }
  }
}
