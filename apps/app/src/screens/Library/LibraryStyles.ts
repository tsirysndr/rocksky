import { StyleSheet } from "react-native";
import { colors } from "../../theme";

export const libraryStyles = StyleSheet.create({
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.inputBackground,
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    paddingVertical: 9,
  },
  pillBar: {
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: 12,
  },
  pillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.surface2,
  },
  pillActive: {
    backgroundColor: colors.primary,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  pillTextActive: {
    color: "#fff",
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    gap: 12,
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.text,
  },
  rowSubtitle: {
    fontSize: 11,
    color: colors.textMuted,
  },
  newButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    marginBottom: 6,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  newButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  albumCard: {
    flex: 1 / 3,
    marginBottom: 14,
  },
  albumArtBox: {
    aspectRatio: 1,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: colors.surface2,
    marginBottom: 5,
  },
  albumArt: {
    width: "100%",
    height: "100%",
  },
  albumArtFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  albumTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.text,
  },
});
