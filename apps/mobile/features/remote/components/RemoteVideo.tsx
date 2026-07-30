import { StyleSheet } from "react-native";
import { RTCView } from "react-native-webrtc";
import type { MediaStream } from "react-native-webrtc";

interface RemoteVideoProps {
  stream: MediaStream;
}

export function RemoteVideo({ stream }: RemoteVideoProps) {
  return <RTCView streamURL={stream.toURL()} style={styles.video} objectFit="contain" />;
}

const styles = StyleSheet.create({
  video: { flex: 1, backgroundColor: "#000" },
});
