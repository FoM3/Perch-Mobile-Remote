import { useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import type { InputSender } from "../../../services/input";

interface KeyboardCaptureProps {
  input: InputSender | null;
}

// Visible compose bar: shows what you type (the laptop field is hidden behind the
// keyboard) while mirroring each edit to the desktop as text / backspace / enter.
export function KeyboardCapture({ input }: KeyboardCaptureProps) {
  const [text, setText] = useState("");
  const prev = useRef("");

  const onChangeText = (next: string) => {
    const before = prev.current;
    if (next !== before) {
      if (next.startsWith(before)) {
        input?.text(next.slice(before.length));
      } else if (before.startsWith(next)) {
        for (let i = 0; i < before.length - next.length; i++) input?.key("BACKSPACE");
      } else {
        // Replacement (e.g. autocorrect): clear the old tail, type the new one
        for (let i = 0; i < before.length; i++) input?.key("BACKSPACE");
        if (next.length > 0) input?.text(next);
      }
    }
    prev.current = next;
    setText(next);
  };

  const submit = () => {
    input?.key("ENTER");
    prev.current = "";
    setText("");
  };

  return (
    <View style={styles.bar}>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={onChangeText}
        onSubmitEditing={submit}
        autoFocus
        autoCorrect={false}
        autoCapitalize="none"
        spellCheck={false}
        blurOnSubmit={false}
        placeholder="Type here; sends to the laptop"
        placeholderTextColor="#5a6470"
        returnKeyType="send"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: "rgba(16, 20, 24, 0.98)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
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
});
