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

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: () => {
          origin.current = gainRef.current;
          const now = Date.now();
          if (now - lastTap.current < 280) {
            onChange(0);
            lastTap.current = 0;
            return;
          }
          lastTap.current = now;
        },
        onPanResponderMove: (_event, gesture) => {
          const usable = Math.max(1, heightRef.current - THUMB);
          // Up is a boost, so the sign flips; a full track is the full range.
          const delta = (-gesture.dy / usable) * (MAX_GAIN * 2);
          onChange(clampGain(origin.current + delta));
        },
        onPanResponderRelease: () => onRelease?.(),
        onPanResponderTerminate: () => onRelease?.(),
      }),
    [disabled, onChange, onRelease],
  );

  const onLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    heightRef.current = height;
    setTrackHeight(height);
  };

  const usable = Math.max(0, trackHeight - THUMB);
  const ratio = clampGain(gain) / MAX_GAIN; // -1..1
  const centre = usable / 2;
  const thumbBottom = centre + (ratio * usable) / 2;
  const fillHeight = Math.abs(thumbBottom - centre);

  return (
    <View style={styles.wrap}>
      <View {...responder.panHandlers} style={styles.track} onLayout={onLayout}>
        <View style={styles.rail} />
        <View style={[styles.centreLine, { bottom: centre + THUMB / 2 }]} />
        {trackHeight > 0 && (
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
        )}
        {trackHeight > 0 && (
          <View
            pointerEvents="none"
            style={[
              styles.thumb,
              { bottom: thumbBottom, opacity: disabled ? 0.5 : 1 },
            ]}
          />
        )}
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
    width: 22,
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
