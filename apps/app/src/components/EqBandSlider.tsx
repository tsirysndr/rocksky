import { useMemo, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  View,
} from "react-native";
import { colors } from "../theme";
import { Text } from "./Text";

type Props = {
  /** Tenths of a dB, -240..240. */
  gain: number;
  /** e.g. "1k". */
  freqLabel: string;
  disabled?: boolean;
  onChange: (gain: number) => void;
  onRelease?: () => void;
};

const MAX_GAIN = 240;
const THUMB = 14;
const DOUBLE_TAP_MS = 300;
/** Floor for the track, so a band is never zero-height. */
const MIN_TRACK = 90;
// Movement under this is a tap, not a drag.
const TAP_SLOP = 4;
// A drag is reported at most this often: the thumb follows the finger from local
// state, while every report re-renders the whole settings sheet.
const REPORT_MS = 50;

const clampGain = (value: number) =>
  Math.min(MAX_GAIN, Math.max(-MAX_GAIN, Math.round(value)));

/**
 * One vertical equalizer band, zero in the middle.
 *
 * The fill grows from the centre line rather than the bottom, so a cut reads as
 * a cut; dragging moves the thumb by total travel over the measured track, and
 * a double-tap flattens the band.
 */
export default function EqBandSlider({
  gain,
  freqLabel,
  disabled,
  onChange,
  onRelease,
}: Props) {
  const [trackHeight, setTrackHeight] = useState(0);
  const gainRef = useRef(gain);
  gainRef.current = gain;
  const heightRef = useRef(0);
  const origin = useRef(0);
  const lastTap = useRef(0);
  const dragged = useRef(false);
  // While a drag is in flight the thumb follows this, not the prop.
  const [live, setLive] = useState<number | null>(null);
  const lastReport = useRef(0);
  const unreported = useRef<number | null>(null);

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Draggable even while the EQ is bypassed: `disabled` dims the band to
        // show it is not in circuit, but a slider you cannot move reads as
        // broken — and moving one is how you say you want the EQ on.
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // Hold the touch against the enclosing ScrollView, which would
        // otherwise take over a vertical drag.
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          origin.current = gainRef.current;
          dragged.current = false;
          unreported.current = null;
          lastReport.current = 0;
          setLive(gainRef.current);
        },
        onPanResponderMove: (_event, gesture) => {
          if (Math.abs(gesture.dy) > TAP_SLOP) dragged.current = true;
          const usable = Math.max(1, heightRef.current - THUMB);
          // Up is a boost, so the sign flips; a full track is the full range.
          const delta = (-gesture.dy / usable) * (MAX_GAIN * 2);
          const next = clampGain(origin.current + delta);
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
          // Whatever the throttle held back is where the finger ended.
          if (unreported.current !== null) {
            onChange(unreported.current);
            unreported.current = null;
          }
          setLive(null);
          // Two taps in a row flatten the band; a tap that became a drag doesn't.
          if (!dragged.current) {
            const now = Date.now();
            if (now - lastTap.current < DOUBLE_TAP_MS) {
              lastTap.current = 0;
              onChange(0);
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
    [onChange, onRelease],
  );

  const onLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    heightRef.current = height;
    setTrackHeight(height);
  };

  // Before onLayout reports, assume the minimum: the thumb then already sits at
  // the stored gain on the first paint instead of waiting a frame — or, when a
  // parent gave the track no height, never appearing at all.
  const height = trackHeight > 0 ? trackHeight : MIN_TRACK;
  const usable = Math.max(0, height - THUMB);
  const ratio = clampGain(live ?? gain) / MAX_GAIN; // -1..1
  const centre = usable / 2;
  const thumbBottom = centre + (ratio * usable) / 2;
  const fillHeight = Math.abs(thumbBottom - centre);

  return (
    <View style={styles.wrap}>
      <View {...responder.panHandlers} style={styles.track} onLayout={onLayout}>
        <View style={styles.rail} />
        <View style={[styles.centreLine, { bottom: centre + THUMB / 2 }]} />
        <View
          pointerEvents="none"
          style={[
            styles.fill,
            {
              height: fillHeight,
              bottom: Math.min(thumbBottom, centre) + THUMB / 2,
              opacity: disabled ? 0.4 : 1,
            },
          ]}
        />
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            { bottom: thumbBottom, opacity: disabled ? 0.5 : 1 },
          ]}
        />
      </View>
      <Text numberOfLines={1} style={styles.freq}>
        {freqLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  track: {
    flex: 1,
    // A floor, so a parent that sizes to content can never leave the band with
    // no height — which would make it invisible and impossible to drag.
    minHeight: MIN_TRACK,
    // The rail is 3px; the touch column is the whole band's width so a finger
    // doesn't have to be precise.
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  rail: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 3,
    borderRadius: 2,
    backgroundColor: colors.surface2,
  },
  centreLine: {
    position: "absolute",
    width: 12,
    height: 1,
    backgroundColor: colors.border,
  },
  fill: {
    position: "absolute",
    width: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  thumb: {
    position: "absolute",
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  freq: {
    fontSize: 9,
    color: colors.textMuted,
  },
});
