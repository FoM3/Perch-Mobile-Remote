import { useEffect, useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Mouse, Pointer, Keyboard as KeyboardIcon, Power, Monitor, Crop } from "lucide-react-native";
import { useSessionStore } from "../store/sessionStore";
import { ControlSurface } from "../features/remote/components/ControlSurface";
import { ShortcutBar } from "../features/remote/components/ShortcutBar";
import { KeyboardCapture } from "../features/remote/components/KeyboardCapture";
import type { ControlMode, Region } from "../features/remote/components/ControlSurface";

export default function RemoteScreen() {
  const router = useRouter();
  const { status, remoteStream, remoteAspect, monitorCount, monitorIndex, input, disconnect } =
    useSessionStore();
  const [mode, setMode] = useState<ControlMode>("trackpad");
  const [selectMode, setSelectMode] = useState(false);
  const [region, setRegion] = useState<Region | null>(null);
  const [keyboardActive, setKeyboardActive] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (status === "disconnected" || status === "failed") {
      router.dismissTo("/");
    }
  }, [status, router]);

  // Track keyboard height to dock the compose bar; sync state if it closes itself
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) =>
      setKeyboardHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
      setKeyboardActive(false);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const toggleKeyboard = () => {
    if (keyboardActive) {
      Keyboard.dismiss();
      setKeyboardActive(false);
    } else {
      setKeyboardActive(true);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.stage}>
        {remoteStream ? (
          <ControlSurface
            stream={remoteStream}
            aspect={remoteAspect}
            mode={mode}
            input={input}
            selectMode={selectMode}
            currentRegion={region}
            onExitSelectMode={() => setSelectMode(false)}
            onRegionSelected={(r) => {
              setRegion(r);
              input?.setRegion(r);
            }}
          />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>Waiting for video…</Text>
          </View>
        )}
      </View>

      {/* Floating circular controls on the left, out of the way of the desktop */}
      <View style={styles.fabColumn} pointerEvents="box-none">
        <Pressable
          style={styles.fab}
          onPress={() => setMode((m) => (m === "trackpad" ? "touch" : "trackpad"))}
        >
          {mode === "trackpad" ? (
            <Mouse color="#e6e9ec" size={26} />
          ) : (
            <Pointer color="#e6e9ec" size={26} />
          )}
          <Text style={styles.fabLabel}>{mode === "trackpad" ? "Pad" : "Touch"}</Text>
        </Pressable>
        <Pressable
          style={[styles.fab, selectMode && styles.fabActive]}
          onPress={() => setSelectMode((v) => !v)}
        >
          <Crop color={selectMode ? "#ffffff" : "#e6e9ec"} size={24} />
          <Text style={styles.fabLabel}>Region</Text>
        </Pressable>
        <Pressable style={[styles.fab, keyboardActive && styles.fabActive]} onPress={toggleKeyboard}>
          <KeyboardIcon color={keyboardActive ? "#ffffff" : "#e6e9ec"} size={26} />
        </Pressable>
        {monitorCount > 1 && (
          <Pressable
            style={styles.fab}
            onPress={() => {
              setRegion(null); // switching screens clears the crop on both sides
              input?.selectMonitor((monitorIndex + 1) % monitorCount);
            }}
          >
            <Monitor color="#e6e9ec" size={24} />
            <Text style={styles.fabLabel}>{`M${monitorIndex + 1}/${monitorCount}`}</Text>
          </Pressable>
        )}
        <Pressable style={[styles.fab, styles.fabDanger]} onPress={disconnect}>
          <Power color="#f0a07a" size={24} />
        </Pressable>
      </View>

      {/* Compose bar + shortcuts, docked directly above the keyboard while typing */}
      {keyboardActive && (
        <View style={[styles.dock, { bottom: keyboardHeight }]}>
          <ShortcutBar input={input} />
          <KeyboardCapture input={input} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  stage: { flex: 1 },
  placeholder: { alignItems: "center", flex: 1, justifyContent: "center" },
  placeholderText: { color: "#8a94a0", fontSize: 16 },
  fabColumn: {
    position: "absolute",
    left: 14,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    gap: 16,
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(20, 26, 32, 0.82)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  fabActive: { backgroundColor: "rgba(47, 129, 247, 0.92)", borderColor: "rgba(47,129,247,1)" },
  fabDanger: { backgroundColor: "rgba(70, 26, 26, 0.85)", borderColor: "rgba(240, 136, 62, 0.5)" },
  fabLabel: { color: "#c7ced6", fontSize: 10, marginTop: 1, fontWeight: "600" },
  dock: {
    left: 0,
    position: "absolute",
    right: 0,
  },
});
