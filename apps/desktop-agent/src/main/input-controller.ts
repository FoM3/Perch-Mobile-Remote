import { spawn, ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { resourcePath } from "./resources";

// Child-process input helper: one JSON control message per stdin line, injected
// via Windows SendInput. Isolated from the agent for debuggability and safety.
let helper: ChildProcess | null = null;
let enabled = false;

export function startInputController(): void {
  if (helper) return;
  const path = resourcePath("input-helper.exe");
  if (!existsSync(path)) {
    console.error(`[input] helper not found at ${path}; input disabled`);
    return;
  }
  helper = spawn(path, [], { stdio: ["pipe", "ignore", "pipe"] });
  helper.stderr?.on("data", (d) => console.error(`[input] helper stderr: ${d}`));
  helper.on("exit", (code) => {
    console.log(`[input] helper exited (${code})`);
    helper = null;
  });
  console.log(`[input] helper started: ${path}`);
}

// Only inject while a session is active; a disabled controller drops all input
export function setInputEnabled(value: boolean): void {
  enabled = value;
}

export function injectInput(message: unknown): void {
  if (!enabled || !helper || !helper.stdin) return;
  try {
    helper.stdin.write(JSON.stringify(message) + "\n");
  } catch (error) {
    console.error("[input] write failed:", error);
  }
}

// Configuration (not gated by enabled): tells the helper the active monitor bounds
export function configureMonitor(payload: {
  primary: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}): void {
  if (!helper || !helper.stdin) return;
  try {
    helper.stdin.write(JSON.stringify({ type: "monitor.set", payload }) + "\n");
    console.log(`[input] active monitor set (primary=${payload.primary})`);
  } catch (error) {
    console.error("[input] monitor config failed:", error);
  }
}

export function stopInputController(): void {
  helper?.kill();
  helper = null;
  enabled = false;
}
