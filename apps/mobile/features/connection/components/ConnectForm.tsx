import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SIGNALING_PORT } from "@mobile-remote/protocol";
import { connectFormSchema } from "../types";
import type { ConnectFormValues } from "../types";

interface ConnectFormProps {
  defaultHost: string;
  connecting: boolean;
  onSubmit: (values: ConnectFormValues) => void;
}

export function ConnectForm({ defaultHost, connecting, onSubmit }: ConnectFormProps) {
  const { control, handleSubmit, formState } = useForm<ConnectFormValues>({
    resolver: zodResolver(connectFormSchema),
    defaultValues: { host: defaultHost, port: SIGNALING_PORT, pin: "" },
  });

  return (
    <View style={styles.form}>
      <Text style={styles.label}>Laptop IP address</Text>
      <Controller
        control={control}
        name="host"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            style={styles.input}
            placeholder="192.168.1.20"
            placeholderTextColor="#5a6470"
            keyboardType="numeric"
            autoCapitalize="none"
            autoCorrect={false}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
          />
        )}
      />
      {formState.errors.host && <Text style={styles.error}>{formState.errors.host.message}</Text>}

      <Text style={styles.label}>Port</Text>
      <Controller
        control={control}
        name="port"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={String(value ?? "")}
            onChangeText={onChange}
            onBlur={onBlur}
          />
        )}
      />
      {formState.errors.port && <Text style={styles.error}>{formState.errors.port.message}</Text>}

      <Text style={styles.label}>Pairing PIN (shown on the laptop)</Text>
      <Controller
        control={control}
        name="pin"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            style={styles.input}
            placeholder="123456"
            placeholderTextColor="#5a6470"
            keyboardType="numeric"
            autoCapitalize="none"
            autoCorrect={false}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
          />
        )}
      />
      {formState.errors.pin && <Text style={styles.error}>{formState.errors.pin.message}</Text>}

      <Pressable
        style={[styles.button, connecting && styles.buttonDisabled]}
        disabled={connecting}
        onPress={handleSubmit(onSubmit)}
      >
        <Text style={styles.buttonText}>{connecting ? "Connecting…" : "Connect"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 8 },
  label: { color: "#8a94a0", fontSize: 13, marginTop: 8 },
  input: {
    backgroundColor: "#1a2027",
    borderColor: "#29323c",
    borderWidth: 1,
    borderRadius: 8,
    color: "#e6e9ec",
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  error: { color: "#f0883e", fontSize: 12 },
  button: {
    alignItems: "center",
    backgroundColor: "#2f81f7",
    borderRadius: 8,
    marginTop: 16,
    paddingVertical: 14,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
