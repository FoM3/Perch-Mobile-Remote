import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSessionStore } from "../store/sessionStore";
import { ConnectForm } from "../features/connection/components/ConnectForm";
import type { ConnectFormValues } from "../features/connection/types";

export default function ConnectScreen() {
  const router = useRouter();
  const { status, error, lastHost, connect } = useSessionStore();
  const connecting = status === "connecting" || status === "authenticating" || status === "signaling";

  useEffect(() => {
    if (status === "streaming") {
      router.push("/remote");
    }
  }, [status, router]);

  const handleSubmit = (values: ConnectFormValues) => {
    void connect(values.host, values.port, values.pin);
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.heading}>Connect to your laptop</Text>
      <Text style={styles.subtitle}>
        The desktop agent must be running. Use the laptop's LAN or Tailscale IP.
      </Text>
      <ConnectForm defaultHost={lastHost} connecting={connecting} onSubmit={handleSubmit} />
      {connecting && <Text style={styles.status}>Status: {status}</Text>}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: 8, padding: 20 },
  heading: { color: "#e6e9ec", fontSize: 22, fontWeight: "700" },
  subtitle: { color: "#8a94a0", fontSize: 14, marginBottom: 12 },
  status: { color: "#8a94a0", fontSize: 14, marginTop: 12 },
  error: { color: "#f0883e", fontSize: 14, marginTop: 12 },
});
