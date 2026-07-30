import { app } from "electron";
import { join } from "node:path";
import { existsSync } from "node:fs";

// Resolve a bundled resource in both dev (resources/ beside the app) and packaged builds (extraResources at resourcesPath).
export function resourcePath(name: string): string {
  const candidates = [
    join(app.getAppPath(), "resources", name),
    join(process.resourcesPath ?? "", name),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0];
}
