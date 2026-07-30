import { z } from "zod";

export const PROTOCOL_VERSION = 1;
export const SIGNALING_PORT = 43120;

// Bounds keep malformed or hostile payloads out of the input pipeline
const MAX_TEXT_LENGTH = 16_384;
const MAX_DELTA = 10_000;

const normalized = z.number().min(0).max(1);
const delta = z.number().min(-MAX_DELTA).max(MAX_DELTA);

const envelope = z.object({
  version: z.literal(PROTOCOL_VERSION),
  sessionId: z.string().min(8).max(64),
});

export const mouseButtonSchema = z.enum(["left", "right", "middle"]);

// Fast channel: unordered, no retransmits; stale events are dropped, not replayed
export const pointerAbsoluteSchema = envelope.extend({
  type: z.literal("pointer.absolute"),
  payload: z.object({ x: normalized, y: normalized }),
});

export const pointerRelativeSchema = envelope.extend({
  type: z.literal("pointer.relative"),
  payload: z.object({ deltaX: delta, deltaY: delta }),
});

export const pointerScrollSchema = envelope.extend({
  type: z.literal("pointer.scroll"),
  payload: z.object({
    deltaX: delta,
    deltaY: delta,
    // Terminal scroll events travel on the reliable channel so a gesture never ends short
    final: z.boolean().optional(),
  }),
});

export const fastControlSchema = z.discriminatedUnion("type", [
  pointerAbsoluteSchema,
  pointerRelativeSchema,
  pointerScrollSchema,
]);

// Reliable channel: ordered delivery for clicks, keys, text and session commands
export const pointerClickSchema = envelope.extend({
  type: z.literal("pointer.click"),
  payload: z.object({
    button: mouseButtonSchema,
    x: normalized,
    y: normalized,
    double: z.boolean().optional(),
  }),
});

export const pointerButtonSchema = envelope.extend({
  type: z.literal("pointer.button"),
  payload: z.object({
    button: mouseButtonSchema,
    action: z.enum(["down", "up"]),
    x: normalized.optional(),
    y: normalized.optional(),
  }),
});

export const keyboardKeySchema = envelope.extend({
  type: z.literal("keyboard.key"),
  payload: z.object({
    key: z.string().min(1).max(32),
    action: z.enum(["down", "up", "press"]),
  }),
});

export const keyboardTextSchema = envelope.extend({
  type: z.literal("keyboard.text"),
  payload: z.object({ text: z.string().min(1).max(MAX_TEXT_LENGTH) }),
});

export const keyboardShortcutSchema = envelope.extend({
  type: z.literal("keyboard.shortcut"),
  payload: z.object({ keys: z.array(z.string().min(1).max(32)).min(1).max(5) }),
});

export const sessionCommandSchema = envelope.extend({
  type: z.literal("session.command"),
  payload: z.object({ command: z.enum(["disconnect", "ping"]) }),
});

export const captureCommandSchema = envelope.extend({
  type: z.literal("capture.command"),
  payload: z.object({
    command: z.enum(["set-quality", "select-monitor", "set-region"]),
    quality: z.enum(["low", "medium", "high"]).optional(),
    monitorIndex: z.number().int().min(0).max(15).optional(),
    // Server-side crop: encode only this region at full resolution (null = full screen)
    region: z
      .object({ x: normalized, y: normalized, w: normalized, h: normalized })
      .nullable()
      .optional(),
  }),
});

export const reliableControlSchema = z.discriminatedUnion("type", [
  pointerClickSchema,
  pointerButtonSchema,
  keyboardKeySchema,
  keyboardTextSchema,
  keyboardShortcutSchema,
  sessionCommandSchema,
  captureCommandSchema,
  pointerScrollSchema,
]);

// Signaling (WebSocket): pairing, auth, SDP/ICE exchange, heartbeat
export const signalingSchema = z.discriminatedUnion("type", [
  z.object({
    version: z.literal(PROTOCOL_VERSION),
    type: z.literal("pairing.request"),
    payload: z.object({
      pairingToken: z.string().min(16).max(128),
      deviceName: z.string().min(1).max(64),
      devicePublicKey: z.string().min(32).max(1024),
    }),
  }),
  z.object({
    version: z.literal(PROTOCOL_VERSION),
    type: z.literal("auth.request"),
    payload: z.object({
      deviceId: z.string().min(1).max(64),
      deviceName: z.string().min(1).max(64).optional(),
      // Pairing PIN shown on the desktop; proves the user can see the laptop
      secret: z.string().min(4).max(64),
    }),
  }),
  z.object({
    version: z.literal(PROTOCOL_VERSION),
    sessionId: z.string().min(8).max(64),
    type: z.literal("webrtc.answer"),
    payload: z.object({ sdp: z.string().max(65_536) }),
  }),
  z.object({
    version: z.literal(PROTOCOL_VERSION),
    sessionId: z.string().min(8).max(64),
    type: z.literal("webrtc.ice"),
    payload: z.object({
      candidate: z.string().max(2048),
      sdpMid: z.string().max(64).nullable(),
      sdpMLineIndex: z.number().int().min(0).max(255).nullable(),
    }),
  }),
  z.object({
    version: z.literal(PROTOCOL_VERSION),
    sessionId: z.string().min(8).max(64),
    type: z.literal("heartbeat"),
    payload: z.object({ timestamp: z.number().int().nonnegative() }),
  }),
]);
