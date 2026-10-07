import Feather from "@expo/vector-icons/Feather";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { useState } from "react";
import { Alert, Linking, TouchableOpacity, View } from "react-native";
import { Text } from "./Text";
import { colors } from "../theme";

export default function RecordingMetadata({
  mbId,
  isrc,
}: {
  mbId?: string | null;
  isrc?: string | null;
}) {
  const [copied, setCopied] = useState("");
  const recordingId = mbId?.trim();
  const code = isrc?.trim();
  if (!recordingId && !code) return null;
  return (
    <View style={{ gap: 12, marginBottom: 24 }}>
      {recordingId && (
        <TouchableOpacity
          accessibilityRole="link"
          accessibilityLabel="View on MusicBrainz"
          onPress={() =>
            void Linking.openURL(
              `https://musicbrainz.org/recording/${encodeURIComponent(recordingId)}`,
            ).catch(() =>
              Alert.alert("MusicBrainz", "Could not open the recording page."),
            )
          }
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingVertical: 12,
            borderRadius: 14,
            backgroundColor: colors.surface2,
          }}
        >
          <Image
            source={require("../../assets/images/musicbrainz.svg")}
            style={{ width: 24, height: 24 }}
            contentFit="contain"
            accessible={false}
          />
          <Text style={{ color: colors.text, fontSize: 14 }}>
            View on MusicBrainz
          </Text>
        </TouchableOpacity>
      )}
      {code && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Text selectable style={{ color: colors.textMuted, fontSize: 13 }}>
            ISRC: {code}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Copy ISRC"
            style={{ padding: 12 }}
            onPress={async () => {
              try {
                await Clipboard.setStringAsync(code);
                setCopied(code);
              } catch {
                Alert.alert("Clipboard", "Could not copy the ISRC.");
              }
            }}
          >
            <Feather
              name={copied === code ? "check" : "copy"}
              size={18}
              color={colors.textMuted}
            />
          </TouchableOpacity>
          {copied === code && (
            <Text
              accessibilityLiveRegion="polite"
              style={{ color: colors.textMuted, fontSize: 12 }}
            >
              Copied
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
