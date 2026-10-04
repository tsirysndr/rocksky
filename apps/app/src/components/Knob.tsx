import Feather from "@expo/vector-icons/Feather";
import { useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, TouchableOpacity, View } from "react-native";
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
  /**
   * How many discrete positions the value has, so the steppers can nudge by
   * exactly one. Turning a rotary with a thumb is imprecise at best; the
   * buttons are how you actually land on a value.
   */
  steps?: number;
  onChange: (norm: number) => void;
  /** Called when the gesture ends, to flush a coalesced write. */
  onRelease?: () => void;
};

// Pixels of travel for a full sweep. The desktop uses 140 with a mouse; a thumb
// on a phone has less room and less patience, so the sweep is shorter here.
const TRAVEL = 70;
const SWEEP = 270;
const DOUBLE_TAP_MS = 300;
// Movement under this is a tap, not a turn — a finger never lands perfectly still.
const TAP_SLOP = 4;
// A turn is reported at most this often. The face follows the finger from local
// state; every report re-renders the whole settings sheet, and doing that on
// every move event is what made the knobs feel stiff.
const REPORT_MS = 50;

const clamp01 = (value: number) =>
  Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

/**
 * The rotary from the desktop and web clients: drag to turn, double-tap to
 * reset. The indicator sweeps -135°…+135°.
 *
 * Vertical movement turns it, and horizontal adds to that, so a diagonal drag
 * works too — a finger rarely travels straight.
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
  steps = 50,
  onChange,
  onRelease,
}: Props) {
  const clamped = clamp01(norm);
  // Read through a ref inside the responder: it is created once, so capturing
  // `clamped` directly would freeze the gesture's origin at the first render.
  const normRef = useRef(clamped);
  normRef.current = clamped;
  // While a drag is in flight the face follows this, not the prop, so it tracks
  // the finger even though the value is reported less often.
  const [live, setLive] = useState<number | null>(null);
  const origin = useRef(0);
  const lastTap = useRef(0);
  const turned = useRef(false);
  const lastReport = useRef(0);
  const unreported = useRef<number | null>(null);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        // The sheet is a ScrollView, which would otherwise claim a vertical
        // drag: once the knob has the touch it keeps it, so turning works and
        // a tap is never swallowed mid-gesture.
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          origin.current = normRef.current;
          turned.current = false;
          unreported.current = null;
          lastReport.current = 0;
          setLive(normRef.current);
        },
        onPanResponderMove: (_event, gesture) => {
          // Total travel from where the finger went down, not a sum of deltas,
          // which drifts. Up and right both turn it up.
          const travel = -gesture.dy + gesture.dx;
          if (Math.abs(travel) > TAP_SLOP) turned.current = true;
          const next = clamp01(origin.current + travel / TRAVEL);
          setLive(next);
          const now = Date.now();
          if (now - lastReport.current >= REPORT_MS) {
            lastReport.current = now;
            unreported.current = null;
            onChange(next);
            return;
          }
          unreported.current = next;
        },
        onPanResponderRelease: () => {
          // Whatever the throttle held back is the value the finger ended on.
          if (unreported.current !== null) {
            onChange(unreported.current);
            unreported.current = null;
          }
          setLive(null);
          // Decided on release, not on the next touch: a tap followed by a drag
          // is a drag, and only two taps in a row reset.
          if (!turned.current) {
            const now = Date.now();
            if (now - lastTap.current < DOUBLE_TAP_MS) {
              lastTap.current = 0;
              onChange(defaultNorm);
              onRelease?.();
              return;
            }
            lastTap.current = now;
          }
          onRelease?.();
        },
        onPanResponderTerminate: () => {
          setLive(null);
          onRelease?.();
        },
      }),
    [disabled, defaultNorm, onChange, onRelease],
  );

  // One tap, one step — and the write goes out at once, since a tap has no
  // gesture end to coalesce against.
  const step = (direction: 1 | -1) => {
    const next = clamp01(clamped + (direction * 1) / Math.max(1, steps));
    onChange(next);
    onRelease?.();
  };

  const shown = live ?? clamped;
  const angle = -SWEEP / 2 + shown * SWEEP;
  const dot = Math.round(size * 0.28);

  return (
    <View style={[styles.wrap, { width: Math.max(size + 16, 66) }]}>
      <Text style={styles.value}>{valueText}</Text>
      <View
        {...responder.panHandlers}
        // A thumb is wider than the face.
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
      <View style={styles.stepper}>
        <TouchableOpacity
          onPress={() => step(-1)}
          disabled={disabled}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
          accessibilityLabel={`${label} down`}
          style={[styles.stepButton, disabled && styles.stepDisabled]}
        >
          <Feather name="minus" size={13} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => step(1)}
          disabled={disabled}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
          accessibilityLabel={`${label} up`}
          style={[styles.stepButton, disabled && styles.stepDisabled]}
        >
          <Feather name="plus" size={13} color={colors.text} />
        </TouchableOpacity>
      </View>
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
  stepper: {
    flexDirection: "row",
    gap: 6,
  },
  stepButton: {
    width: 26,
    height: 24,
    borderRadius: 7,
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDisabled: {
    opacity: 0.4,
  },
});
