import { waveformLevels } from "../lib/waveformLevels";
import { useState } from "react";
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
  const [width, setWidth] = useState(320);
  const count = Math.max(32, Math.min(128, Math.floor((width - 32) / 4)));
  const values = waveformLevels(props.peaks, count);
  const fraction = Math.max(0, Math.min(1, props.position / props.duration));
  return (
    <View style={styles.container} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <View pointerEvents="none" style={styles.bars} accessible={false}>
        {values.map((peak, i) => (
          <View key={i} style={{ flex: 1, borderRadius: 2, height: Math.max(3, peak / 255 * 80),
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
  container: { height: 88, width: "100%" },
  // Android's native slider insets its usable track from either edge.
  bars: { position: "absolute", left: 16, right: 16, top: 4, bottom: 4,
    flexDirection: "row", alignItems: "center", gap: 2 },
});
