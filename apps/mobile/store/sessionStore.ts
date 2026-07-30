import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MediaStream } from "react-native-webrtc";
import { SignalingClient } from "../services/signaling";
import type { IcePayload } from "../services/signaling";
import { createViewerPeer, acceptOffer, addRemoteIce } from "../services/webrtc";
import type { ViewerPeer } from "../services/webrtc";
import { InputSender } from "../services/input";

export type SessionStatus =
  | "disconnected"
  | "connecting"
  | "authenticating"
  | "signaling"
  | "streaming"
  | "failed";

interface SessionState {
  status: SessionStatus;
  error: string | null;
  lastHost: string;
  remoteStream: MediaStream | null;
  // Desktop aspect ratio (width / height); refined by the capture.info message
  remoteAspect: number;
  monitorCount: number;
  monitorIndex: number;
  input: InputSender | null;
  connect: (host: string, port: number, pin: string) => Promise<void>;
  disconnect: () => void;
}

let signaling: SignalingClient | null = null;
let viewer: ViewerPeer | null = null;
// Buffer remote ICE until the offer is applied; early candidates would be rejected
let remoteReady = false;
let pendingIce: IcePayload[] = [];
// Incremented on every connect/disconnect; stale async callbacks compare against it
let sessionToken = 0;

interface RtcChannel {
  readyState: string;
  send: (data: string) => void;
  onmessage?: ((event: { data: unknown }) => void) | null;
}

function teardown(): void {
  viewer?.close();
  viewer = null;
  signaling?.close();
  signaling = null;
  remoteReady = false;
  pendingIce = [];
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      status: "disconnected",
      error: null,
      lastHost: "",
      remoteStream: null,
      remoteAspect: 16 / 9,
      monitorCount: 1,
      monitorIndex: 0,
      input: null,

      connect: async (host, port, pin) => {
        teardown();
        const myToken = ++sessionToken;
        const isStale = () => myToken !== sessionToken;
        set({
          status: "connecting",
          error: null,
          lastHost: host,
          remoteStream: null,
          input: null,
          remoteAspect: 16 / 9,
          monitorCount: 1,
          monitorIndex: 0,
        });
        try {
          signaling = new SignalingClient(host, port, {
            onOffer: (sdp) => {
              if (isStale()) return;
              set({ status: "signaling" });
              if (viewer && signaling) {
                acceptOffer(viewer.peer, sdp)
                  .then((answer) => {
                    if (isStale()) return;
                    signaling?.sendAnswer(answer);
                    remoteReady = true;
                    for (const c of pendingIce) {
                      if (viewer) void addRemoteIce(viewer.peer, c).catch(() => {});
                    }
                    pendingIce = [];
                  })
                  .catch((e) => console.error("acceptOffer failed", e));
              }
            },
            onRemoteIce: (candidate) => {
              if (isStale()) return;
              if (viewer && remoteReady) void addRemoteIce(viewer.peer, candidate).catch(() => {});
              else pendingIce.push(candidate);
            },
            onSessionEnded: (reason) => {
              if (isStale()) return;
              teardown();
              set({ status: "disconnected", error: `Session ended: ${reason}`, remoteStream: null, input: null });
            },
            onClosed: () => {
              if (isStale()) return;
              if (get().status !== "disconnected") {
                teardown();
                set({ status: "disconnected", remoteStream: null, input: null });
              }
            },
          });

          viewer = createViewerPeer(signaling, {
            onStream: (stream) => {
              if (isStale()) return;
              set({ remoteStream: stream });
            },
            onChannels: (reliable, pointer) => {
              if (isStale()) return;
              const sessionId = signaling?.sessionId ?? "";
              const reliableChannel = reliable as RtcChannel;
              // Desktop sends capture.info on the reliable channel to set aspect
              reliableChannel.onmessage = (event) => {
                try {
                  const msg = JSON.parse(String(event.data));
                  if (msg?.type === "capture.info" && msg.payload?.width && msg.payload?.height) {
                    set({
                      remoteAspect: msg.payload.width / msg.payload.height,
                      monitorCount: msg.payload.monitorCount ?? 1,
                      monitorIndex: msg.payload.monitorIndex ?? 0,
                    });
                  }
                } catch {
                  // ignore non-JSON frames
                }
              };
              set({ input: new InputSender(reliableChannel, pointer as RtcChannel, sessionId) });
            },
            onConnectionState: (state) => {
              if (isStale()) return;
              if (state === "connected") {
                set({ status: "streaming" });
              } else if (state === "failed") {
                teardown();
                set({ status: "failed", error: "WebRTC connection failed", remoteStream: null, input: null });
              } else if (state === "disconnected" || state === "closed") {
                // No auto-reconnect yet: end the session instead of freezing on stale video
                teardown();
                set({ status: "disconnected", remoteStream: null, input: null });
              }
            },
          });

          await signaling.connect();
          if (isStale()) return;
          set({ status: "authenticating" });
          await signaling.authenticate("android", pin);
          if (isStale()) return;
          set({ status: "signaling" });
        } catch (error) {
          // A superseded attempt must not tear down the newer connection
          if (isStale()) return;
          teardown();
          set({
            status: "failed",
            error: error instanceof Error ? error.message : "Connection failed",
            remoteStream: null,
          });
        }
      },

      disconnect: () => {
        sessionToken++;
        teardown();
        set({ status: "disconnected", error: null, remoteStream: null, input: null });
      },
    }),
    {
      name: "session-preferences",
      storage: createJSONStorage(() => AsyncStorage),
      // Only remember the last host; live connection state never persists
      partialize: (state) => ({ lastHost: state.lastHost }) as SessionState,
    },
  ),
);
