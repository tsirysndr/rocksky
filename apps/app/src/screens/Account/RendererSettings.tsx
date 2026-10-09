import Feather from "@expo/vector-icons/Feather";
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { mediaRenderer } from "../../../modules/rocksky-engine";
import { Text } from "../../components/Text";
import ThemedSwitch from "../../components/ThemedSwitch";
import { colors } from "../../theme";

export default function RendererSettings() {
  const navigation = useNavigation();
  const cache = useQueryClient();
  const status = useQuery({
    queryKey: ["media-renderer"],
    queryFn: () => mediaRenderer.request({ action: "status" }),
    refetchInterval: 1500,
  });
  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (
        enabled &&
        Platform.OS === "android" &&
        Number(Platform.Version) >= 33
      ) {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
      }
      const result = await mediaRenderer.request({ enabled });
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: (result) => cache.setQueryData(["media-renderer"], result),
    onError: (error) => Alert.alert("Media receiver", error.message),
    onSettled: () => {
      void cache.invalidateQueries({ queryKey: ["media-renderer"] });
    },
  });
  const state = status.data;
  const enabled = toggle.isPending
    ? toggle.variables
    : (state?.enabled ?? false);
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
          style={styles.back}
        >
          <Feather name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.heading}>Media receiver</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Feather name="radio" size={40} color={colors.primary} />
          <Text style={styles.title}>Play here, from anywhere at home</Text>
          <Text style={styles.description}>
            Choose this phone in a UPnP / DLNA music app on your local network
            and listen through Rocksky.
          </Text>
        </View>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={styles.label}>UPnP / DLNA receiver</Text>
              <Text style={styles.detail}>
                Allow devices on your network to play and control audio on this
                phone.
              </Text>
            </View>
            <ThemedSwitch
              value={enabled}
              disabled={toggle.isPending || status.isPending}
              onValueChange={(value) => toggle.mutate(value)}
              accessibilityLabel="Enable UPnP DLNA media receiver"
            />
          </View>
          <View style={styles.divider} />
          <Text style={styles.detail}>Device name</Text>
          <Text selectable style={styles.label}>
            {state?.name ?? "Rocksky"}
          </Text>
          <View style={styles.status}>
            <View
              style={[
                styles.dot,
                {
                  backgroundColor:
                    state?.running && enabled
                      ? "#22C55E"
                      : colors.textMuted,
                },
              ]}
            />
            <Text style={styles.detail}>
              {state?.error ??
                (status.error
                  ? status.error.message
                  : enabled
                    ? state?.running
                      ? "Ready to receive music"
                      : "Waiting for Wi-Fi or Ethernet"
                    : "Receiver is off")}
            </Text>
          </View>
        </View>
        <Text style={styles.description}>
          Keep both devices on the same Wi-Fi or Ethernet network. Use a
          controller such as BubbleUPnP to select this phone as the player.
        </Text>
        <Text style={styles.description}>
          While enabled, Rocksky stays available in the background and shows a
          receiver notification. Turn it off here or from the notification to
          stop receiving.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 12,
  },
  back: { padding: 12 },
  heading: { fontSize: 20, fontWeight: "700" },
  content: { padding: 24, gap: 24 },
  hero: { gap: 18, paddingVertical: 16 },
  title: { fontSize: 28, fontWeight: "700", lineHeight: 35 },
  description: { color: colors.textMuted, fontSize: 15, lineHeight: 23 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    gap: 10,
  },
  row: { flexDirection: "row", gap: 16, alignItems: "center" },
  label: { fontSize: 16, fontWeight: "600" },
  detail: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 20,
    flexShrink: 1,
  },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
  status: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  dot: { height: 7, width: 7, borderRadius: 4 },
});
