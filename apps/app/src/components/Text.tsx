import {
  Text as RNText,
  StyleSheet,
  type TextProps,
  type TextStyle,
} from "react-native";
import { colors } from "../theme";

function getFontFamily(fontWeight?: TextStyle["fontWeight"]): string {
  if (
    fontWeight === "bold" ||
    fontWeight === "700" ||
    fontWeight === "800" ||
    fontWeight === "900"
  ) {
    return "RockfordSansBold";
  }
  if (fontWeight === "500" || fontWeight === "600") {
    return "RockfordSansMedium";
  }
  return "RockfordSansRegular";
}

export function Text({ style, ...props }: TextProps) {
  const flat = StyleSheet.flatten(style) ?? {};
  const fontFamily = flat.fontFamily || getFontFamily(flat.fontWeight);
  return (
    <RNText
      style={[
        { color: colors.text },
        style,
        { fontFamily, fontWeight: "normal" },
      ]}
      {...props}
    />
  );
}
