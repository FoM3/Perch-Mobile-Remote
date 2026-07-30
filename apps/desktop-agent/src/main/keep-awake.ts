import { powerSaveBlocker } from "electron";

let blockerId: number | null = null;

// Remote access stops if Windows sleeps or locks; this prevents the sleep half
export function setKeepAwake(enabled: boolean): void {
  if (enabled && blockerId === null) {
    blockerId = powerSaveBlocker.start("prevent-display-sleep");
  } else if (!enabled && blockerId !== null) {
    powerSaveBlocker.stop(blockerId);
    blockerId = null;
  }
}

export function isKeepAwake(): boolean {
  return blockerId !== null && powerSaveBlocker.isStarted(blockerId);
}
