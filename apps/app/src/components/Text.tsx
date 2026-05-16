import { Text as RNText, TextProps, TextStyle } from "react-native";

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
  const flat: TextStyle = Array.isArray(style)
    ? Object.assign({}, ...(style as object[]))
    : (style as TextStyle) || {};
  const fontFamily = flat.fontFamily || getFontFamily(flat.fontWeight);
  return <RNText style={[style, { fontFamily, fontWeight: "normal" }]} {...props} />;
}
