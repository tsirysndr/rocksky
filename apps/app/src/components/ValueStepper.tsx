import Feather from "@expo/vector-icons/Feather";
import { useRef } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { colors } from "../theme";
import { Text } from "./Text";

type Props = {
  label: string;
  /** The reading between the buttons, already formatted. */
  valueText: string;
  /** Current position, 0..1. */
  norm: number;
  /** Where a long-press on the value resets to. */
  defaultNorm?: number;
  /** How many discrete positions the value has: one tap moves exactly one. */
  steps?: number;
  disabled?: boolean;
  onChange: (norm: number) => void;
  /** Called after a change, to flush a coalesced write. */
  onRelease?: () => void;
};

// Hold to repeat: a wait before it starts, then one step per tick. Covers a
// 30-step range in a couple of seconds without any dragging.
const REPEAT_DELAY_MS = 350;
const REPEAT_EVERY_MS = 90;

const clamp01 = (value: number) =>
  Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

/**
 * A value with − and + buttons.
 *
 * This replaces the rotary knob the desktop and web clients use: turning one
 * with a thumb, inside a sheet that itself scrolls, was unusable on a phone.
 * Tapping is precise, holding repeats, and a long-press on the reading resets.
 */
export default function ValueStepper({
  label,
  valueText,
  norm,
  defaultNorm = 0.5,
  steps = 50,
  disabled,
  onChange,
  onRelease,
}: Props) {
  const clamped = clamp01(norm);
  // The repeat timer reads the value through a ref: it is scheduled once per
  // press, so a captured value would freeze at the value it started from.
  const normRef = useRef(clamped);
  normRef.current = clamped;
  const delay = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeat = useRef<ReturnType<typeof setInterval> | null>(null);

  const stepBy = (direction: 1 | -1) => {
    const next = clamp01(normRef.current + direction / Math.max(1, steps));
    if (next === normRef.current) return;
    normRef.current = next;
    onChange(next);
  };

  const stop = () => {
    if (delay.current) {
      clearTimeout(delay.current);
      delay.current = null;
    }
    if (repeat.current) {
      clearInterval(repeat.current);
      repeat.current = null;
    }
    onRelease?.();
  };

  const start = (direction: 1 | -1) => {
    stepBy(direction);
    delay.current = setTimeout(() => {
      repeat.current = setInterval(() => stepBy(direction), REPEAT_EVERY_MS);
    }, REPEAT_DELAY_MS);
  };

  return (
    <View style={styles.row}>
      <Text numberOfLines={1} style={styles.label}>
        {label}
      </Text>
      <TouchableOpacity
        onPressIn={() => start(-1)}
        onPressOut={stop}
        disabled={disabled}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 6 }}
        accessibilityLabel={`${label} down`}
        style={[styles.button, disabled && styles.disabled]}
      >
        <Feather name="minus" size={15} color={colors.text} />
      </TouchableOpacity>
      <TouchableOpacity
        onLongPress={() => {
          onChange(defaultNorm);
          onRelease?.();
        }}
        disabled={disabled}
        accessibilityLabel={`${label}: ${valueText}. Long press to reset.`}
        style={styles.valueBox}
      >
        <Text style={[styles.value, disabled && styles.disabled]}>
          {valueText}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPressIn={() => start(1)}
        onPressOut={stop}
        disabled={disabled}
        hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}
        accessibilityLabel={`${label} up`}
        style={[styles.button, disabled && styles.disabled]}
      >
        <Feather name="plus" size={15} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 40,
  },
  label: {
    flex: 1,
    fontSize: 12,
    color: colors.textMuted,
  },
  button: {
    width: 34,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  valueBox: {
    minWidth: 62,
    alignItems: "center",
  },
  value: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary,
    fontVariant: ["tabular-nums"],
  },
  disabled: {
    opacity: 0.4,
  },
});
