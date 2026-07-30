import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  MediaStream,
} from "react-native-webrtc";
import type { SignalingClient, IcePayload } from "./signaling";

export interface ViewerPeer {
  peer: RTCPeerConnection;
  close: () => void;
}

export interface ViewerEvents {
  onStream: (stream: MediaStream) => void;
  onChannels: (reliable: unknown, pointer: unknown) => void;
  onConnectionState: (state: string) => void;
}

// The desktop is the offerer; the phone answers and receives track + channels
export function createViewerPeer(signaling: SignalingClient, events: ViewerEvents): ViewerPeer {
  const peer = new RTCPeerConnection({ iceServers: [] });
  let reliable: unknown = null;
  let pointer: unknown = null;

  // The library types events loosely; narrow them at this boundary only
  peer.ontrack = (event: unknown) => {
    const streams = (event as { streams?: MediaStream[] }).streams;
    if (streams?.[0]) events.onStream(streams[0]);
  };

  peer.ondatachannel = (event: unknown) => {
    const channel = (event as { channel: { label: string } }).channel;
    if (channel.label === "reliable-control") reliable = channel;
    if (channel.label === "pointer-control") pointer = channel;
    if (reliable && pointer) events.onChannels(reliable, pointer);
  };

  peer.onicecandidate = (event: unknown) => {
    const candidate = (event as { candidate: RTCIceCandidate | null }).candidate;
    if (candidate) {
      signaling.sendIce({
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid ?? null,
        sdpMLineIndex: candidate.sdpMLineIndex ?? null,
      });
    }
  };

  peer.onconnectionstatechange = () => {
    events.onConnectionState(peer.connectionState);
  };

  return {
    peer,
    close: () => peer.close(),
  };
}

export async function acceptOffer(peer: RTCPeerConnection, sdp: string): Promise<string> {
  await peer.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp }));
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  return answer.sdp ?? "";
}

export async function addRemoteIce(peer: RTCPeerConnection, payload: IcePayload): Promise<void> {
  await peer.addIceCandidate(
    new RTCIceCandidate({
      candidate: payload.candidate,
      sdpMid: payload.sdpMid ?? undefined,
      sdpMLineIndex: payload.sdpMLineIndex ?? undefined,
    }),
  );
}
