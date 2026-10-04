import { Switch, type SwitchProps } from "react-native";
import { colors } from "../theme";
export default function ThemedSwitch(props: SwitchProps) {
  return (
    <Switch
      {...props}
      trackColor={{ false: colors.toggleTrack, true: colors.primary }}
      thumbColor={colors.text}
      ios_backgroundColor={colors.toggleTrack}
    />
  );
}
