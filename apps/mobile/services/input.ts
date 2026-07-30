import { PROTOCOL_VERSION } from "@mobile-remote/protocol";

// Minimal shape of an RTCDataChannel we use; react-native-webrtc types it loosely
interface SendChannel {
  readyState: string;
  send: (data: string) => void;
}

export type MouseButton = "left" | "right" | "middle";

// Splits input across the two channels: reliable for discrete actions, unreliable for the high-rate move/scroll stream.
export class InputSender {
  constructor(
    private readonly reliable: SendChannel | null,
    private readonly pointer: SendChannel | null,
    private readonly sessionId: string,
  ) {}

  private send(channel: SendChannel | null, type: string, payload: unknown): void {
    if (!channel || channel.readyState !== "open") return;
    channel.send(JSON.stringify({ version: PROTOCOL_VERSION, sessionId: this.sessionId, type, payload }));
  }

  moveAbsolute(x: number, y: number): void {
    this.send(this.pointer, "pointer.absolute", { x: clamp01(x), y: clamp01(y) });
  }

  moveRelative(deltaX: number, deltaY: number): void {
    this.send(this.pointer, "pointer.relative", { deltaX, deltaY });
  }

  // Mid-gesture deltas ride the fast channel; the terminal delta rides reliable
  scroll(deltaX: number, deltaY: number, final = false): void {
    this.send(final ? this.reliable : this.pointer, "pointer.scroll", { deltaX, deltaY, final });
  }

  click(x: number, y: number, button: MouseButton = "left", double = false): void {
    this.send(this.reliable, "pointer.click", { button, x: clamp01(x), y: clamp01(y), double });
  }

  button(action: "down" | "up", x: number, y: number, btn: MouseButton = "left"): void {
    this.send(this.reliable, "pointer.button", { button: btn, action, x: clamp01(x), y: clamp01(y) });
  }

  // Trackpad click: acts at the desktop cursor's current position, no coordinates
  clickAtCursor(btn: MouseButton = "left"): void {
    this.send(this.reliable, "pointer.button", { button: btn, action: "down" });
    this.send(this.reliable, "pointer.button", { button: btn, action: "up" });
  }

  text(value: string): void {
    if (value.length > 0) this.send(this.reliable, "keyboard.text", { text: value });
  }

  key(name: string, action: "down" | "up" | "press" = "press"): void {
    this.send(this.reliable, "keyboard.key", { key: name, action });
  }

  shortcut(keys: string[]): void {
    if (keys.length > 0) this.send(this.reliable, "keyboard.shortcut", { keys });
  }

  selectMonitor(monitorIndex: number): void {
    this.send(this.reliable, "capture.command", { command: "select-monitor", monitorIndex });
  }

  setRegion(region: { x: number; y: number; w: number; h: number } | null): void {
    this.send(this.reliable, "capture.command", { command: "set-region", region });
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
