import {
  fastControlSchema,
  reliableControlSchema,
  QUALITY_PRESETS,
} from "@mobile-remote/protocol";
import type { MonitorInfo } from "../../preload";

type HostState = "idle" | "capturing" | "connecting" | "streaming" | "failed";
interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

let peer: RTCPeerConnection | null = null;
let rawStream: MediaStream | null = null;
let outputStream: MediaStream | null = null;
let videoEl: HTMLVideoElement | null = null;
let canvasEl: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let rafId = 0;
let lastDraw = 0;
let cropRegion: Region | null = null;
let reliableChannel: RTCDataChannel | null = null;
let currentSessionId: string | null = null;
let monitors: MonitorInfo[] = [];
let currentMonitorIndex = 0;
let remoteReady = false;
let pendingIce: RTCIceCandidateInit[] = [];
const stateListeners = new Set<(state: HostState) => void>();

const DRAW_INTERVAL_MS = 45; // ~22 fps canvas render

export function onHostState(listener: (state: HostState) => void): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

function setState(state: HostState): void {
  window.agentApi.rtc.reportState(state);
  stateListeners.forEach((listener) => listener(state));
}

async function captureMonitor(sourceId: string): Promise<MediaStream> {
  const preset = QUALITY_PRESETS.high;
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: sourceId,
        maxWidth: preset.width,
        maxHeight: preset.height,
        maxFrameRate: preset.frameRate,
      },
    },
  } as MediaStreamConstraints);
}

function ensurePipeline(): void {
  if (!videoEl) {
    videoEl = document.createElement("video");
    videoEl.muted = true;
    videoEl.autoplay = true;
    (videoEl as HTMLVideoElement & { playsInline: boolean }).playsInline = true;
  }
  if (!canvasEl) {
    canvasEl = document.createElement("canvas");
    canvasEl.width = 1920;
    canvasEl.height = 1080;
    ctx = canvasEl.getContext("2d", { alpha: false });
  }
}

// Draw either the full frame or the cropped region into the canvas at native
// resolution, so the encoded stream is sharp for whatever the phone is viewing.
function renderLoop(ts: number): void {
  rafId = requestAnimationFrame(renderLoop);
  if (ts - lastDraw < DRAW_INTERVAL_MS) return;
  lastDraw = ts;
  const v = videoEl;
  if (!v || !ctx || !canvasEl) return;
  const rw = v.videoWidth;
  const rh = v.videoHeight;
  if (rw === 0 || rh === 0) return;
  if (cropRegion) {
    const sx = Math.round(cropRegion.x * rw);
    const sy = Math.round(cropRegion.y * rh);
    const sw = Math.max(2, Math.round(cropRegion.w * rw));
    const sh = Math.max(2, Math.round(cropRegion.h * rh));
    if (canvasEl.width !== sw || canvasEl.height !== sh) {
      canvasEl.width = sw;
      canvasEl.height = sh;
    }
    ctx.drawImage(v, sx, sy, sw, sh, 0, 0, sw, sh);
  } else {
    if (canvasEl.width !== rw || canvasEl.height !== rh) {
      canvasEl.width = rw;
      canvasEl.height = rh;
    }
    ctx.drawImage(v, 0, 0, rw, rh);
  }
}

function outputDims(): { width: number; height: number } {
  const rw = videoEl?.videoWidth || 1920;
  const rh = videoEl?.videoHeight || 1080;
  if (cropRegion) {
    return { width: Math.round(cropRegion.w * rw), height: Math.round(cropRegion.h * rh) };
  }
  return { width: rw, height: rh };
}

function sendCaptureInfo(): void {
  if (!reliableChannel || reliableChannel.readyState !== "open") return;
  const dims = outputDims();
  reliableChannel.send(
    JSON.stringify({
      type: "capture.info",
      payload: {
        width: dims.width,
        height: dims.height,
        monitorIndex: currentMonitorIndex,
        monitorCount: monitors.length,
      },
    }),
  );
}

async function selectMonitor(index: number): Promise<void> {
  const target = monitors.find((m) => m.index === index);
  if (!target || !videoEl) return;
  try {
    const next = await captureMonitor(target.sourceId);
    rawStream?.getTracks().forEach((t) => t.stop());
    rawStream = next;
    videoEl.srcObject = next;
    await videoEl.play();
    cropRegion = null; // a different screen invalidates the crop
    currentMonitorIndex = index;
    window.agentApi.rtc.reportMonitorSelected(index);
    setTimeout(sendCaptureInfo, 300);
    console.log(`[rtc-host] switched to monitor ${index}`);
  } catch (error) {
    console.error("[rtc-host] monitor switch failed:", error);
  }
}

function setRegion(region: Region | null): void {
  cropRegion =
    region && region.w > 0.01 && region.h > 0.01
      ? { x: region.x, y: region.y, w: region.w, h: region.h }
      : null;
  // Report the new output dimensions a couple times so the phone re-letterboxes
  sendCaptureInfo();
  setTimeout(sendCaptureInfo, 200);
  console.log(`[rtc-host] region ${cropRegion ? JSON.stringify(cropRegion) : "cleared"}`);
}

// Map a pointer message from region-space (what the phone sees) to full-desktop
function remapForRegion(msg: { type: string; payload: Record<string, unknown> }): unknown {
  if (!cropRegion) return msg;
  const p = msg.payload;
  if (typeof p.x === "number" && typeof p.y === "number") {
    return {
      ...msg,
      payload: {
        ...p,
        x: cropRegion.x + (p.x as number) * cropRegion.w,
        y: cropRegion.y + (p.y as number) * cropRegion.h,
      },
    };
  }
  return msg;
}

function handleControlMessage(raw: unknown, channelName: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    return;
  }
  const schema = channelName === "pointer-control" ? fastControlSchema : reliableControlSchema;
  const result = schema.safeParse(parsed);
  if (!result.success) return;
  if (result.data.sessionId !== currentSessionId) return;

  if (result.data.type === "capture.command") {
    const payload = result.data.payload;
    if (payload.command === "select-monitor" && typeof payload.monitorIndex === "number") {
      void selectMonitor(payload.monitorIndex);
    } else if (payload.command === "set-region") {
      setRegion(payload.region ?? null);
    }
    return;
  }

  window.agentApi.rtc.reportInput(remapForRegion(result.data));
}

function attachChannel(channel: RTCDataChannel): void {
  channel.onmessage = (event) => handleControlMessage(event.data, channel.label);
}

async function startHost(sessionId: string): Promise<void> {
  stopHost();
  currentSessionId = sessionId;
  remoteReady = false;
  pendingIce = [];
  cropRegion = null;
  setState("capturing");

  try {
    monitors = await window.agentApi.rtc.listMonitors();
    const startMonitor = monitors.find((m) => m.primary) ?? monitors[0];
    if (!startMonitor) throw new Error("No screen source available");
    currentMonitorIndex = startMonitor.index;
    window.agentApi.rtc.reportMonitorSelected(currentMonitorIndex);

    ensurePipeline();
    rawStream = await captureMonitor(startMonitor.sourceId);
    videoEl!.srcObject = rawStream;
    await videoEl!.play();
    lastDraw = 0;
    rafId = requestAnimationFrame(renderLoop);
    outputStream = canvasEl!.captureStream(QUALITY_PRESETS.high.frameRate);

    peer = new RTCPeerConnection({ iceServers: [] });
    for (const track of outputStream.getTracks()) {
      peer.addTrack(track, outputStream);
    }

    reliableChannel = peer.createDataChannel("reliable-control", { ordered: true });
    attachChannel(reliableChannel);
    attachChannel(
      peer.createDataChannel("pointer-control", { ordered: false, maxRetransmits: 0 }),
    );

    reliableChannel.onopen = () => {
      sendCaptureInfo();
      setTimeout(sendCaptureInfo, 400);
      setTimeout(sendCaptureInfo, 1200);
      setTimeout(sendCaptureInfo, 3000);
    };

    peer.onicecandidate = (event) => {
      if (event.candidate && currentSessionId) {
        window.agentApi.rtc.sendIce(currentSessionId, {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        });
      }
    };

    peer.onconnectionstatechange = () => {
      const state = peer?.connectionState;
      console.log(`[rtc-host] connectionState: ${state}`);
      if (state === "connected") setState("streaming");
      else if (state === "failed" || state === "disconnected") setState("failed");
    };
    peer.oniceconnectionstatechange = () => {
      console.log(`[rtc-host] iceConnectionState: ${peer?.iceConnectionState}`);
    };

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    window.agentApi.rtc.sendOffer(sessionId, offer.sdp ?? "");
    setState("connecting");
  } catch (error) {
    console.error("[rtc-host] failed to start:", error);
    setState("failed");
    stopHost();
  }
}

function stopHost(): void {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  peer?.close();
  peer = null;
  reliableChannel = null;
  outputStream?.getTracks().forEach((t) => t.stop());
  outputStream = null;
  rawStream?.getTracks().forEach((t) => t.stop());
  rawStream = null;
  if (videoEl) videoEl.srcObject = null;
  cropRegion = null;
  currentSessionId = null;
}

export function initRtcHost(): void {
  window.agentApi.rtc.onStart((sessionId) => void startHost(sessionId));
  window.agentApi.rtc.onAnswer((sessionId, sdp) => {
    if (sessionId !== currentSessionId || !peer) return;
    peer
      .setRemoteDescription({ type: "answer", sdp })
      .then(() => {
        remoteReady = true;
        for (const c of pendingIce) peer?.addIceCandidate(c).catch(() => {});
        pendingIce = [];
      })
      .catch((e) => console.error("[rtc-host] setRemoteDescription failed:", e));
  });
  window.agentApi.rtc.onRemoteIce((sessionId, candidate) => {
    if (sessionId !== currentSessionId || !peer) return;
    const init: RTCIceCandidateInit = {
      candidate: candidate.candidate,
      sdpMid: candidate.sdpMid ?? undefined,
      sdpMLineIndex: candidate.sdpMLineIndex ?? undefined,
    };
    if (remoteReady) peer.addIceCandidate(init).catch(() => {});
    else pendingIce.push(init);
  });
  window.agentApi.rtc.onStop(() => {
    stopHost();
    setState("idle");
  });
  window.agentApi.rtc.onDisplaysChanged(() => {
    if (!peer) return;
    void window.agentApi.rtc.listMonitors().then((list) => {
      monitors = list;
      if (!monitors.find((m) => m.index === currentMonitorIndex)) {
        const fallback = monitors.find((m) => m.primary) ?? monitors[0];
        if (fallback) return void selectMonitor(fallback.index);
      }
      sendCaptureInfo();
    });
  });
}
