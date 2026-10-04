import { useMemo, useRef } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import { colors } from "../theme";
import { Text } from "./Text";

type Props = {
  label: string;
  /** The reading above the face, already formatted. */
  valueText: string;
  /** Current position, 0..1. */
  norm: number;
  /** Where a double-tap resets to. */
  defaultNorm?: number;
  size?: number;
  disabled?: boolean;
  onChange: (norm: number) => void;
  /** Called when the gesture ends, to flush a coalesced write. */
  onRelease?: () => void;
};

// Pixels of vertical travel for a full sweep, as on the desktop client.
const TRAVEL = 140;
const SWEEP = 270;
const DOUBLE_TAP_MS = 280;

const clamp01 = (value: number) =>
  Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

/**
 * The rotary from the desktop and web clients: drag up or down to turn,
 * double-tap to reset. The indicator sweeps -135°…+135°.
 *
 * The pointer is a bar inside a square that is rotated as a whole, so it pivots
 * about the knob's centre without any transform-origin arithmetic — React
 * Native rotates a view about its own centre.
 */
export default function Knob({
  label,
  valueText,
  norm,
  defaultNorm = 0.5,
  size = 54,
  disabled,
  onChange,
  onRelease,
}: Props) {
  const clamped = clamp01(norm);
  // Read through a ref inside the responder: it is created once, so capturing
  // `clamped` directly would freeze the gesture's origin at the first render.
  const normRef = useRef(clamped);
  normRef.current = clamped;
  const origin = useRef(0);
  const lastTap = useRef(0);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: () => {
          origin.current = normRef.current;
          const now = Date.now();
          if (now - lastTap.current < DOUBLE_TAP_MS) {
            onChange(defaultNorm);
            lastTap.current = 0;
            return;
          }
          lastTap.current = now;
        },
        onPanResponderMove: (_event, gesture) => {
          // Total travel from where the finger went down, not a sum of deltas,
          // which drifts.
          onChange(clamp01(origin.current - gesture.dy / TRAVEL));
        },
        onPanResponderRelease: () => onRelease?.(),
        onPanResponderTerminate: () => onRelease?.(),
      }),
    [disabled, defaultNorm, onChange, onRelease],
  );

  const angle = -SWEEP / 2 + clamped * SWEEP;
  const dot = Math.round(size * 0.28);

  return (
    <View style={[styles.wrap, { width: Math.max(size + 16, 66) }]}>
      <Text style={styles.value}>{valueText}</Text>
      <View
        {...responder.panHandlers}
        style={[
          styles.face,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            opacity: disabled ? 0.4 : 1,
          },
        ]}
      >
        <View
          style={[
            styles.pointerBox,
            {
              width: size,
              height: size,
              transform: [{ rotate: `${angle}deg` }],
            },
          ]}
          pointerEvents="none"
        >
          <View style={styles.pointer} />
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.hub,
            { width: dot, height: dot, borderRadius: dot / 2 },
          ]}
        />
      </View>
      <Text numberOfLines={1} style={styles.label}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    gap: 5,
  },
  value: {
    fontSize: 10,
    color: colors.primary,
    fontVariant: ["tabular-nums"],
  },
  face: {
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  pointerBox: {
    position: "absolute",
    alignItems: "center",
  },
  pointer: {
    width: 3,
    height: "30%",
    marginTop: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  hub: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    fontSize: 10,
    color: colors.textMuted,
  },
});
