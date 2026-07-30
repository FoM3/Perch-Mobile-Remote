import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: {
    // Protocol ships as TS source, so it must be bundled, not externalized
    plugins: [externalizeDepsPlugin({ exclude: ["@mobile-remote/protocol"] })],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
  },
});
