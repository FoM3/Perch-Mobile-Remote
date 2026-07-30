import { describe, it, expect } from "vitest";
import {
  reliableControlSchema,
  fastControlSchema,
  signalingSchema,
  PROTOCOL_VERSION,
} from "./schemas";

const sid = "session-abcd1234";

describe("reliableControlSchema", () => {
  it("accepts a valid click", () => {
    const msg = {
      version: PROTOCOL_VERSION,
      sessionId: sid,
      type: "pointer.click",
      payload: { button: "left", x: 0.5, y: 0.5 },
    };
    expect(reliableControlSchema.safeParse(msg).success).toBe(true);
  });

  it("rejects out-of-range coordinates", () => {
    const msg = {
      version: PROTOCOL_VERSION,
      sessionId: sid,
      type: "pointer.click",
      payload: { button: "left", x: 1.5, y: 0.5 },
    };
    expect(reliableControlSchema.safeParse(msg).success).toBe(false);
  });

  it("rejects an over-long text payload", () => {
    const msg = {
      version: PROTOCOL_VERSION,
      sessionId: sid,
      type: "keyboard.text",
      payload: { text: "a".repeat(20_000) },
    };
    expect(reliableControlSchema.safeParse(msg).success).toBe(false);
  });

  it("accepts a select-monitor capture command", () => {
    const msg = {
      version: PROTOCOL_VERSION,
      sessionId: sid,
      type: "capture.command",
      payload: { command: "select-monitor", monitorIndex: 1 },
    };
    expect(reliableControlSchema.safeParse(msg).success).toBe(true);
  });
});

describe("fastControlSchema", () => {
  it("accepts a pointer move", () => {
    const msg = {
      version: PROTOCOL_VERSION,
      sessionId: sid,
      type: "pointer.absolute",
      payload: { x: 0.1, y: 0.9 },
    };
    expect(fastControlSchema.safeParse(msg).success).toBe(true);
  });

  it("rejects an unknown type", () => {
    const msg = { version: PROTOCOL_VERSION, sessionId: sid, type: "pointer.teleport", payload: {} };
    expect(fastControlSchema.safeParse(msg).success).toBe(false);
  });
});

describe("signalingSchema auth", () => {
  it("accepts an auth request with a secret", () => {
    const msg = {
      version: PROTOCOL_VERSION,
      type: "auth.request",
      payload: { deviceId: "android", deviceName: "Phone", secret: "123456" },
    };
    expect(signalingSchema.safeParse(msg).success).toBe(true);
  });

  it("rejects an auth request with too short a secret", () => {
    const msg = {
      version: PROTOCOL_VERSION,
      type: "auth.request",
      payload: { deviceId: "android", secret: "12" },
    };
    expect(signalingSchema.safeParse(msg).success).toBe(false);
  });
});
