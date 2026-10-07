import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "../../components/Text";
import { colors } from "../../theme";
import DeviceLibrary from "./DeviceLibrary";
import UploadedLibrary from "./Library";

export default function Library() {
  const [source, setSource] = useState("uploaded");
  useEffect(() => {
    void AsyncStorage.getItem("library-source").then((value) => {
      if (value === "device" && Platform.OS === "android") setSource(value);
    });
  }, []);
  return (
    <SafeAreaView
      edges={["top"]}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      {Platform.OS === "android" && (
        <View
          style={{
            flexDirection: "row",
            paddingHorizontal: 16,
            paddingVertical: 8,
            gap: 8,
          }}
        >
          {[
            ["uploaded", "Uploaded music"],
            ["device", "Local music"],
          ].map(([value, label]) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: source === value }}
              key={value}
              onPress={() => {
                setSource(value);
                void AsyncStorage.setItem("library-source", value);
              }}
              style={{
                flex: 1,
                alignItems: "center",
                padding: 10,
                borderRadius: 12,
                backgroundColor:
                  source === value ? colors.primary : colors.surface2,
              }}
            >
              <Text>{label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {source === "device" ? <DeviceLibrary /> : <UploadedLibrary />}
    </SafeAreaView>
  );
}
