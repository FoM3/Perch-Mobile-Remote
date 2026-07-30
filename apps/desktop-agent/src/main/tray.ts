import { Menu, Tray, nativeImage } from "electron";
import { isKeepAwake } from "./keep-awake";
import { resourcePath } from "./resources";

let tray: Tray | null = null;

interface TrayHandlers {
  onOpenSettings: () => void;
  onToggleKeepAwake: (enabled: boolean) => void;
  onQuit: () => void;
}

export function createTray(handlers: TrayHandlers): Tray {
  const icon = nativeImage
    .createFromPath(resourcePath("tray.png"))
    .resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("Perch Agent");

  const rebuildMenu = (): void => {
    const menu = Menu.buildFromTemplate([
      { label: "Status: Ready", enabled: false },
      { label: "Connected device: None", enabled: false },
      { type: "separator" },
      { label: "Open settings", click: handlers.onOpenSettings },
      {
        label: "Keep computer awake",
        type: "checkbox",
        checked: isKeepAwake(),
        click: (item) => {
          handlers.onToggleKeepAwake(item.checked);
          rebuildMenu();
        },
      },
      { type: "separator" },
      { label: "Quit", click: handlers.onQuit },
    ]);
    tray?.setContextMenu(menu);
  };

  rebuildMenu();
  tray.on("double-click", handlers.onOpenSettings);
  return tray;
}
