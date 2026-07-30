import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { PROTOCOL_VERSION, SIGNALING_PORT, signalingSchema } from "@mobile-remote/protocol";
import type { ServerSignalingMessage } from "@mobile-remote/protocol";

// Dev binding for LAN testing; Phase 4 pairing narrows this to the Tailscale interface
const BIND_HOST = process.env.MR_BIND_HOST ?? "0.0.0.0";
const MAX_INVALID_MESSAGES = 5;

export interface IceCandidatePayload {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

interface SignalingHandlers {
  onStateChange: () => void;
  onSessionStart: (sessionId: string) => void;
  onAnswer: (sessionId: string, sdp: string) => void;
  onRemoteIce: (sessionId: string, candidate: IceCandidatePayload) => void;
  onSessionEnd: () => void;
  validateSecret: (secret: string) => boolean;
}

const MAX_AUTH_ATTEMPTS = 5;
const MAX_PAYLOAD = 128 * 1024;
const IP_MAX_FAILURES = 8;
const IP_LOCKOUT_MS = 60_000;

// Per-IP failure tracking so a new socket can't bypass the per-socket limit
const authFailures = new Map<string, { fails: number; until: number }>();

function ipLockedOut(ip: string, now: number): boolean {
  const rec = authFailures.get(ip);
  return rec !== undefined && rec.until > now;
}

function recordAuthFailure(ip: string, now: number): void {
  const rec = authFailures.get(ip) ?? { fails: 0, until: 0 };
  rec.fails += 1;
  if (rec.fails >= IP_MAX_FAILURES) {
    rec.until = now + IP_LOCKOUT_MS;
    rec.fails = 0;
  }
  authFailures.set(ip, rec);
}

let server: WebSocketServer | null = null;
let client: WebSocket | null = null;
let listening = false;
let activeSessionId: string | null = null;
let handlers: SignalingHandlers | null = null;

export function getSignalingStatus() {
  return {
    listening,
    host: BIND_HOST,
    port: SIGNALING_PORT,
    clientConnected: client !== null,
    sessionId: activeSessionId,
  };
}

function send(socket: WebSocket, message: ServerSignalingMessage): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

export function sendOffer(sessionId: string, sdp: string): void {
  if (client && sessionId === activeSessionId) {
    send(client, { version: PROTOCOL_VERSION, sessionId, type: "webrtc.offer", payload: { sdp } });
  }
}

export function sendServerIce(sessionId: string, candidate: IceCandidatePayload): void {
  if (client && sessionId === activeSessionId) {
    send(client, { version: PROTOCOL_VERSION, sessionId, type: "webrtc.ice", payload: candidate });
  }
}

export function endActiveSession(reason: string): void {
  if (client && activeSessionId) {
    send(client, {
      version: PROTOCOL_VERSION,
      sessionId: activeSessionId,
      type: "session.ended",
      payload: { reason },
    });
  }
  activeSessionId = null;
  handlers?.onSessionEnd();
  handlers?.onStateChange();
}

export function startSignalingServer(signalingHandlers: SignalingHandlers): void {
  if (server) return;
  handlers = signalingHandlers;

  // Cap payload so an unauthenticated client can't force large allocations
  server = new WebSocketServer({ host: BIND_HOST, port: SIGNALING_PORT, maxPayload: MAX_PAYLOAD });

  server.on("listening", () => {
    listening = true;
    handlers?.onStateChange();
  });

  server.on("error", (error) => {
    console.error("[signaling] server error:", error.message);
    listening = false;
    handlers?.onStateChange();
  });

  server.on("connection", (socket, request) => {
    // A socket must authenticate with the pairing PIN before it can control or
    // take over. Unauthenticated connections cannot touch an active session.
    const ip = request.socket.remoteAddress ?? "unknown";
    let authed = false;
    let invalidCount = 0;
    let authAttempts = 0;

    socket.on("message", (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        parsed = null;
      }
      const result = signalingSchema.safeParse(parsed);
      if (!result.success) {
        invalidCount += 1;
        send(socket, {
          version: PROTOCOL_VERSION,
          type: "error",
          payload: { code: "invalid-message", message: "Message failed validation" },
        });
        if (invalidCount >= MAX_INVALID_MESSAGES) socket.close();
        return;
      }

      const message = result.data;

      if (!authed) {
        if (message.type !== "auth.request") {
          send(socket, {
            version: PROTOCOL_VERSION,
            type: "error",
            payload: { code: "unauthorized", message: "Authenticate first" },
          });
          return;
        }
        const now = Date.now();
        if (ipLockedOut(ip, now)) {
          send(socket, { version: PROTOCOL_VERSION, type: "auth.result", payload: { ok: false } });
          console.log(`[signaling] auth from ${ip} blocked (rate limited)`);
          socket.close();
          return;
        }
        if (!handlers?.validateSecret(message.payload.secret)) {
          authAttempts += 1;
          recordAuthFailure(ip, now);
          send(socket, {
            version: PROTOCOL_VERSION,
            type: "auth.result",
            payload: { ok: false },
          });
          console.log(`[signaling] rejected auth from ${message.payload.deviceId} (bad PIN)`);
          if (authAttempts >= MAX_AUTH_ATTEMPTS) socket.close();
          return;
        }
        authFailures.delete(ip);
        // Authenticated: now it may take over any existing controller
        if (client && client !== socket) {
          console.log("[signaling] authenticated controller taking over");
          const previous = client;
          client = null;
          if (activeSessionId) {
            activeSessionId = null;
            handlers?.onSessionEnd();
          }
          try {
            previous.close();
          } catch {
            // already closing
          }
        }
        client = socket;
        authed = true;
        activeSessionId = randomUUID();
        send(socket, {
          version: PROTOCOL_VERSION,
          type: "auth.result",
          payload: { ok: true, sessionId: activeSessionId },
        });
        console.log(`[signaling] session ${activeSessionId} started for ${message.payload.deviceId}`);
        handlers?.onSessionStart(activeSessionId);
        handlers?.onStateChange();
        return;
      }

      // Only the active authenticated controller is processed past this point
      if (socket !== client) return;

      switch (message.type) {
        case "webrtc.answer":
          if (message.sessionId === activeSessionId) {
            handlers?.onAnswer(message.sessionId, message.payload.sdp);
          }
          break;
        case "webrtc.ice":
          if (message.sessionId === activeSessionId) {
            handlers?.onRemoteIce(message.sessionId, message.payload);
          }
          break;
        case "heartbeat":
          send(socket, {
            version: PROTOCOL_VERSION,
            sessionId: message.sessionId,
            type: "heartbeat",
            payload: { timestamp: Date.now() },
          });
          break;
      }
    });

    socket.on("close", () => {
      if (client === socket) {
        client = null;
        if (activeSessionId) {
          console.log(`[signaling] session ${activeSessionId} ended: controller disconnected`);
          activeSessionId = null;
          handlers?.onSessionEnd();
        }
        handlers?.onStateChange();
      }
    });
  });
}

export function stopSignalingServer(): void {
  client?.close();
  client = null;
  server?.close();
  server = null;
  listening = false;
  activeSessionId = null;
}
