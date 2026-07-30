import { useCallback, useEffect, useRef, useState } from "react";
import { QUALITY_PRESETS } from "@mobile-remote/protocol";
import type { AgentStatus } from "../../preload";

export function App(): JSX.Element {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    void window.agentApi.getStatus().then(setStatus);
    return window.agentApi.onStatus(setStatus);
  }, []);

  const stopCapture = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCapturing(false);
  }, []);

  const startCapture = useCallback(async () => {
    setCaptureError(null);
    try {
      const preset = QUALITY_PRESETS.high;
      // Main process routes getDisplayMedia to the primary monitor
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: false,
        video: {
          width: { ideal: preset.width },
          height: { ideal: preset.height },
          frameRate: { ideal: preset.frameRate, max: preset.frameRate },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      stream.getVideoTracks()[0]?.addEventListener("ended", stopCapture);
      setCapturing(true);
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : String(error));
      stopCapture();
    }
  }, [stopCapture]);

  useEffect(() => stopCapture, [stopCapture]);

  const toggleKeepAwake = useCallback(async (enabled: boolean) => {
    await window.agentApi.setKeepAwake(enabled);
  }, []);

  return (
    <div className="app">
      <div className="header">
        <h1>Perch Agent</h1>
        <span className="version">v{status?.version ?? "…"}</span>
      </div>

      <div className="status-grid">
        <div className="status-card">
          <div className="label">Pairing PIN</div>
          <div className="value pin">{status?.pin ?? "······"}</div>
        </div>
        <div className="status-card">
          <div className="label">Signaling server</div>
          <div className={`value ${status?.signaling.listening ? "ok" : "off"}`}>
            {status?.signaling.listening
              ? `Listening on ${status.signaling.host}:${status.signaling.port}`
              : "Not listening"}
          </div>
        </div>
        <div className="status-card">
          <div className="label">Controller</div>
          <div className={`value ${status?.signaling.clientConnected ? "ok" : ""}`}>
            {status?.signaling.clientConnected ? "Connected" : "None"}
          </div>
        </div>
        <div className="status-card">
          <div className="label">Stream</div>
          <div className={`value ${status?.rtcState === "streaming" ? "ok" : ""}`}>
            {status?.rtcState ?? "idle"}
            {status && status.inputEventCount > 0 ? ` · ${status.inputEventCount} inputs` : ""}
          </div>
        </div>
        <div className="status-card">
          <div className="label">Keep computer awake</div>
          <div className={`value ${status?.keepAwake ? "ok" : "off"}`}>
            {status?.keepAwake ? "Enabled" : "Disabled"}
          </div>
        </div>
      </div>

      <div className="preview">
        <div className="controls">
          {capturing ? (
            <button className="secondary" onClick={stopCapture}>
              Stop preview
            </button>
          ) : (
            <button onClick={() => void startCapture()}>Start capture preview</button>
          )}
          <label className="toggle">
            <input
              type="checkbox"
              checked={status?.keepAwake ?? false}
              onChange={(event) => void toggleKeepAwake(event.target.checked)}
            />
            Keep computer awake
          </label>
          {captureError && <span className="value off">{captureError}</span>}
        </div>
        <video ref={videoRef} muted playsInline />
      </div>
    </div>
  );
}
