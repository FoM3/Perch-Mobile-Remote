import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import type { InputSender } from "../../../services/input";

interface ShortcutBarProps {
  input: InputSender | null;
}

// label shown on the chip; keys sent as a keyboard.shortcut combo
const SHORTCUTS: { label: string; keys: string[] }[] = [
  { label: "Esc", keys: ["ESC"] },
  { label: "Tab", keys: ["TAB"] },
  { label: "Enter", keys: ["ENTER"] },
  { label: "⌫", keys: ["BACKSPACE"] },
  { label: "↑", keys: ["UP"] },
  { label: "↓", keys: ["DOWN"] },
  { label: "←", keys: ["LEFT"] },
  { label: "→", keys: ["RIGHT"] },
  { label: "Ctrl+P", keys: ["CTRL", "P"] },
  { label: "Ctrl+⇧+P", keys: ["CTRL", "SHIFT", "P"] },
  { label: "Ctrl+`", keys: ["CTRL", "`"] },
  { label: "Ctrl+↵", keys: ["CTRL", "ENTER"] },
  { label: "Ctrl+S", keys: ["CTRL", "S"] },
  { label: "Ctrl+C", keys: ["CTRL", "C"] },
  { label: "Ctrl+V", keys: ["CTRL", "V"] },
  { label: "Ctrl+Z", keys: ["CTRL", "Z"] },
];

export function ShortcutBar({ input }: ShortcutBarProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="always"
    >
      {SHORTCUTS.map((s) => (
        <Pressable key={s.label} style={styles.chip} onPress={() => input?.shortcut(s.keys)}>
          <Text style={styles.chipText}>{s.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 6 },
  chip: {
    backgroundColor: "rgba(41, 50, 60, 0.9)",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: { color: "#e6e9ec", fontSize: 13, fontWeight: "600" },
});
