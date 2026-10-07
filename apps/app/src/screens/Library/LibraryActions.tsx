import Feather from "@expo/vector-icons/Feather";
import { StyleSheet, TouchableOpacity } from "react-native";
import { Text } from "../../components/Text";
import { colors } from "../../theme";

export function MoreButton({
  onPress,
  label = "More actions",
}: {
  onPress: () => void;
  label?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={libraryActionStyles.moreButton}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Feather name="more-horizontal" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

export function MenuAction({
  text,
  icon,
  onPress,
  disabled = false,
}: {
  text: string;
  icon?: React.ComponentProps<typeof Feather>["name"];
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[libraryActionStyles.sheetItem, disabled && { opacity: 0.45 }]}
    >
      {icon && <Feather name={icon} size={16} color={colors.text} />}
      <Text style={libraryActionStyles.sheetItemText}>{text}</Text>
    </TouchableOpacity>
  );
}

export const libraryActionStyles = StyleSheet.create({
  moreButton: { paddingHorizontal: 4, paddingVertical: 8 },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.5)" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 28,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 12,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
  },
  sheetItemText: { flex: 1, fontSize: 14, color: colors.text },
});
