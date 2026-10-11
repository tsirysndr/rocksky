import Slider from "@react-native-community/slider";
import { StyleSheet, View } from "react-native";
import { colors } from "../theme";

type Props = {
  peaks: number[] | null;
  duration: number;
  position: number;
  onStart: () => void;
  onChange: (value: number) => void;
  onComplete: (value: number) => void;
};

/** The native slider supplies drag, tap and accessibility seeking; bars are
 * decorative. Until analysis finishes, show a neutral line, not fake audio. */
export default function WaveformSeek(props: Props) {
  const count = 64;
  const values = Array.from({ length: count }, (_, i) => {
    if (!props.peaks?.length) return 0;
    const start = Math.floor(i * props.peaks.length / count);
    const end = Math.max(start + 1, Math.floor((i + 1) * props.peaks.length / count));
    return Math.max(...props.peaks.slice(start, end));
  });
  const fraction = Math.max(0, Math.min(1, props.position / props.duration));
  return (
    <View style={styles.container}>
      <View pointerEvents="none" style={styles.bars} accessible={false}>
        {values.map((peak, i) => (
          <View key={i} style={{ flex: 1, borderRadius: 2, height: Math.max(3, peak / 255 * 44),
            backgroundColor: (i + 0.5) / count <= fraction ? colors.primary : "rgba(255,255,255,0.3)" }} />
        ))}
      </View>
      <Slider
        accessibilityLabel="Playback position"
        style={StyleSheet.absoluteFill}
        minimumValue={0}
        maximumValue={props.duration}
        value={props.position}
        minimumTrackTintColor="transparent"
        maximumTrackTintColor="transparent"
        thumbTintColor="transparent"
        onSlidingStart={props.onStart}
        onValueChange={props.onChange}
        onSlidingComplete={props.onComplete}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  container: { height: 52, width: "100%" },
  // Android's native slider insets its usable track from either edge.
  bars: { position: "absolute", left: 16, right: 16, top: 4, bottom: 4,
    flexDirection: "row", alignItems: "center", gap: 2 },
});
