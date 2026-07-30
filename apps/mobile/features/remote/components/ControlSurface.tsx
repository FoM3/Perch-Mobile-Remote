import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { RemoteVideo } from "./RemoteVideo";
import { videoRect, toNormalized } from "../coords";
import type { InputSender } from "../../../services/input";
import type { MediaStream } from "react-native-webrtc";

export type ControlMode = "touch" | "trackpad";

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ControlSurfaceProps {
  stream: MediaStream;
  aspect: number;
  mode: ControlMode;
  input: InputSender | null;
  trackpadSensitivity?: number;
  // Region select: drag a box; the desktop crops+encodes that region at full res
  selectMode?: boolean;
  currentRegion?: Region | null;
  onExitSelectMode?: () => void;
  onRegionSelected?: (region: Region | null) => void;
}

const MOVE_INTERVAL_MS = 16; // coalesce pointer moves to ~60/s
const MAX_SCALE = 8;
const MIN_SCALE = 1;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function ControlSurface({
  stream,
  aspect,
  mode,
  input,
  trackpadSensitivity = 1.6,
  selectMode = false,
  currentRegion = null,
  onExitSelectMode,
  onRegionSelected,
}: ControlSurfaceProps) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const [selRect, setSelRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(
    null,
  );
  const lastMove = useRef(0);

  // Refs mirror the live view transform so gesture callbacks never read stale state
  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const sizeRef = useRef({ w: 0, h: 0 });
  const pinchStart = useRef(1);
  const pendingScroll = useRef<{ x: number; y: number } | null>(null);

  const apply = (scale: number, tx: number, ty: number) => {
    const s = clamp(scale, MIN_SCALE, MAX_SCALE);
    const { w, h } = sizeRef.current;
    const maxTx = ((s - 1) * w) / 2;
    const maxTy = ((s - 1) * h) / 2;
    const nx = clamp(tx, -maxTx, maxTx);
    const ny = clamp(ty, -maxTy, maxTy);
    scaleRef.current = s;
    txRef.current = nx;
    tyRef.current = ny;
    setView({ scale: s, tx: nx, ty: ny });
  };

  const resetView = () => {
    apply(1, 0, 0);
    onRegionSelected?.(null);
  };

  // Undo the zoom/pan transform, then map into the letterboxed video rect
  const normalized = (px: number, py: number) => {
    const { w, h } = sizeRef.current;
    const s = scaleRef.current;
    const lx = w / 2 + (px - w / 2 - txRef.current) / s;
    const ly = h / 2 + (py - h / 2 - tyRef.current) / s;
    return toNormalized(lx, ly, videoRect(w, h, aspect));
  };

  const onTap = (px: number, py: number) => {
    if (!input) return;
    if (mode === "trackpad") return input.clickAtCursor("left");
    const { x, y } = normalized(px, py);
    input.click(x, y, "left");
  };

  const onDoubleTap = (px: number, py: number) => {
    if (!input) return;
    if (mode === "trackpad") {
      input.clickAtCursor("left");
      input.clickAtCursor("left");
      return;
    }
    const { x, y } = normalized(px, py);
    input.click(x, y, "left", true);
  };

  const onLongPress = (px: number, py: number) => {
    if (!input) return;
    if (mode === "trackpad") return input.clickAtCursor("right");
    const { x, y } = normalized(px, py);
    input.click(x, y, "right");
  };

  const onOnePan = (px: number, py: number, dx: number, dy: number) => {
    // Zoomed in: one finger pans the view (you are reading, not cursoring)
    if (scaleRef.current > 1.01) {
      apply(scaleRef.current, txRef.current + dx, tyRef.current + dy);
      return;
    }
    if (!input) return;
    const now = Date.now();
    if (now - lastMove.current < MOVE_INTERVAL_MS) return;
    lastMove.current = now;
    if (mode === "trackpad") {
      input.moveRelative(dx * trackpadSensitivity, dy * trackpadSensitivity);
    } else {
      const { x, y } = normalized(px, py);
      input.moveAbsolute(x, y);
    }
  };

  const finishSelection = () => {
    const r = selRect;
    setSelRect(null);
    onExitSelectMode?.();
    if (!r) return;
    // Selection is normalized within the currently displayed video (the region)
    const a = normalized(Math.min(r.x0, r.x1), Math.min(r.y0, r.y1));
    const b = normalized(Math.max(r.x0, r.x1), Math.max(r.y0, r.y1));
    const rx = clamp(Math.min(a.x, b.x), 0, 1);
    const ry = clamp(Math.min(a.y, b.y), 0, 1);
    const rw = clamp(Math.abs(b.x - a.x), 0, 1 - rx);
    const rh = clamp(Math.abs(b.y - a.y), 0, 1 - ry);
    if (rw <= 0.03 || rh <= 0.03) return;
    // Compose with the active region so the desktop gets full-screen coordinates
    const cur = currentRegion ?? { x: 0, y: 0, w: 1, h: 1 };
    apply(1, 0, 0); // desktop now does the crop; show its output 1:1
    onRegionSelected?.({
      x: cur.x + rx * cur.w,
      y: cur.y + ry * cur.h,
      w: rw * cur.w,
      h: rh * cur.h,
    });
  };

  const selectPan = Gesture.Pan()
    .runOnJS(true)
    .onStart((e) => setSelRect({ x0: e.x, y0: e.y, x1: e.x, y1: e.y }))
    .onUpdate((e) => setSelRect((prev) => (prev ? { ...prev, x1: e.x, y1: e.y } : null)))
    .onEnd(finishSelection);

  const tap = Gesture.Tap().runOnJS(true).maxDuration(250).onEnd((e) => onTap(e.x, e.y));
  const doubleTap = Gesture.Tap()
    .runOnJS(true)
    .numberOfTaps(2)
    .maxDuration(300)
    .onEnd((e) => onDoubleTap(e.x, e.y));
  const longPress = Gesture.LongPress()
    .runOnJS(true)
    .minDuration(450)
    .onStart((e) => onLongPress(e.x, e.y));

  const onePan = Gesture.Pan()
    .runOnJS(true)
    .maxPointers(1)
    .onChange((e) => onOnePan(e.x, e.y, e.changeX, e.changeY));

  // Two fingers always scroll the desktop, at any zoom level. Each delta is sent
  // exactly once: the previous delta on the fast channel, the final one on the
  // reliable channel, so the gesture end is never lost and never double-applied.
  const twoPan = Gesture.Pan()
    .runOnJS(true)
    .minPointers(2)
    .onChange((e) => {
      const prev = pendingScroll.current;
      if (prev) input?.scroll(prev.x, prev.y, false);
      pendingScroll.current = { x: e.changeX, y: e.changeY };
    })
    .onEnd(() => {
      const last = pendingScroll.current;
      if (last && (last.x !== 0 || last.y !== 0)) input?.scroll(last.x, last.y, true);
      pendingScroll.current = null;
    });

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => {
      pinchStart.current = scaleRef.current;
    })
    .onChange((e) => {
      apply(pinchStart.current * e.scale, txRef.current, tyRef.current);
    });

  const composed = Gesture.Simultaneous(
    pinch,
    twoPan,
    Gesture.Exclusive(doubleTap, tap, longPress, onePan),
  );

  const overlay =
    selRect &&
    ({
      left: Math.min(selRect.x0, selRect.x1),
      top: Math.min(selRect.y0, selRect.y1),
      width: Math.abs(selRect.x1 - selRect.x0),
      height: Math.abs(selRect.y1 - selRect.y0),
    } as const);

  return (
    <GestureDetector gesture={selectMode ? selectPan : composed}>
      <View
        style={styles.fill}
        onLayout={(e) => {
          const next = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
          sizeRef.current = next;
          setSize(next);
        }}
      >
        <View
          style={[
            styles.fill,
            { transform: [{ translateX: view.tx }, { translateY: view.ty }, { scale: view.scale }] },
          ]}
        >
          <RemoteVideo stream={stream} />
        </View>

        {selectMode && (
          <View style={styles.selectHint} pointerEvents="none">
            <Text style={styles.selectHintText}>Drag a box around the area to view</Text>
          </View>
        )}
        {selectMode && overlay && (
          <View style={[styles.selection, overlay]} pointerEvents="none" />
        )}

        {!selectMode && (view.scale > 1.01 || currentRegion) && (
          <Pressable style={styles.resetBadge} onPress={resetView}>
            <Text style={styles.resetText}>{currentRegion ? "Region" : `${view.scale.toFixed(1)}×`} · Reset</Text>
          </Pressable>
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  resetBadge: {
    backgroundColor: "rgba(26, 32, 39, 0.9)",
    borderRadius: 6,
    bottom: 12,
    left: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    position: "absolute",
  },
  resetText: { color: "#e6e9ec", fontSize: 13, fontWeight: "600" },
  selection: {
    position: "absolute",
    borderColor: "#2f81f7",
    borderWidth: 2,
    backgroundColor: "rgba(47, 129, 247, 0.18)",
  },
  selectHint: {
    position: "absolute",
    top: 10,
    alignSelf: "center",
    backgroundColor: "rgba(47, 129, 247, 0.92)",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  selectHintText: { color: "#fff", fontSize: 13, fontWeight: "600" },
});
