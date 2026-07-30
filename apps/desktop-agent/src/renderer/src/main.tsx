import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initRtcHost } from "./rtc-host";
import "./styles.css";

// Singleton outside React so StrictMode double-mount cannot duplicate listeners
initRtcHost();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
