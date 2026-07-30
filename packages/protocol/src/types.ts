import type { z } from "zod";
import type {
  fastControlSchema,
  reliableControlSchema,
  signalingSchema,
} from "./schemas";

export type FastControlMessage = z.infer<typeof fastControlSchema>;
export type ReliableControlMessage = z.infer<typeof reliableControlSchema>;
export type ClientSignalingMessage = z.infer<typeof signalingSchema>;

// Server-to-client signaling; the desktop is the WebRTC host and offer creator
export type ServerSignalingMessage =
  | { version: 1; type: "pairing.challenge"; payload: { challenge: string } }
  | { version: 1; type: "pairing.result"; payload: { approved: boolean; deviceId?: string } }
  | { version: 1; type: "auth.challenge"; payload: { challenge: string } }
  | { version: 1; type: "auth.result"; payload: { ok: boolean; sessionId?: string } }
  | { version: 1; sessionId: string; type: "webrtc.offer"; payload: { sdp: string } }
  | {
      version: 1;
      sessionId: string;
      type: "webrtc.ice";
      payload: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null };
    }
  | { version: 1; sessionId: string; type: "heartbeat"; payload: { timestamp: number } }
  | { version: 1; sessionId: string; type: "session.ended"; payload: { reason: string } }
  | { version: 1; type: "error"; payload: { code: string; message: string } };

export type QualityPreset = "low" | "medium" | "high";

export const QUALITY_PRESETS: Record<
  QualityPreset,
  { width: number; height: number; frameRate: number }
> = {
  low: { width: 854, height: 480, frameRate: 10 },
  medium: { width: 1280, height: 720, frameRate: 15 },
  high: { width: 1920, height: 1080, frameRate: 15 },
};
