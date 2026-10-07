import { useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "../../components/Text";
import { colors } from "../../theme";
import DeviceLibrary from "./DeviceLibrary";
import UploadedLibrary from "./Library";

export default function Library() {
  const [source, setSource] = useState(
    Platform.OS === "android" ? "device" : "uploaded",
  );
  const sourceSwitcher = Platform.OS === "android" && (
    <View style={styles.switcher}>
      {[
        ["device", "Local music"],
        ["uploaded", "Uploaded music"],
      ].map(([value, label]) => (
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: source === value }}
          key={value}
          onPress={() => {
            setSource(value);
          }}
          style={[styles.segment, source === value && styles.activeSegment]}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.segmentLabel,
              source === value && styles.activeLabel,
            ]}
          >
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
  return (
    <SafeAreaView
      edges={["top"]}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      {source === "device" ? (
        <DeviceLibrary sourceSwitcher={sourceSwitcher} />
      ) : (
        <UploadedLibrary sourceSwitcher={sourceSwitcher} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  switcher: {
    flexDirection: "row",
    flexShrink: 0,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
    padding: 4,
    borderRadius: 28,
    backgroundColor: colors.surface2,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  activeSegment: {
    backgroundColor: colors.primary,
  },
  segmentLabel: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  activeLabel: { color: colors.text },
});
