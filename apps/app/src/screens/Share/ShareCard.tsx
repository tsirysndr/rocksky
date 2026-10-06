import Feather from "@expo/vector-icons/Feather";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import * as Sharing from "expo-sharing";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { captureRef, releaseCapture } from "react-native-view-shot";
import { Text } from "../../components/Text";
import { shareText, shareUrl } from "../../lib/shareLinks";
import type { RootStackParamList } from "../../Navigation";
import { colors } from "../../theme";

const palettes = [
  {
    name: "Afterglow",
    colors: ["#f86486", "#7b35cb", "#170b32"] as const,
    accent: "#fff2a3",
  },
  {
    name: "Midnight",
    colors: ["#275b98", "#163653", "#061722"] as const,
    accent: "#8df5d6",
  },
  {
    name: "Ember",
    colors: ["#c65c30", "#6e2846", "#1d1028"] as const,
    accent: "#ffddac",
  },
];
export default function ShareCard({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, "ShareCard">) {
  const item = route.params.item;
  const { width } = useWindowDimensions();
  const card = useRef<View>(null);
  const [format, setFormat] = useState<"story" | "square">("story");
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [imageReady, setImageReady] = useState(!item.artwork);
  const [imageFailed, setImageFailed] = useState(false);
  const [laidOut, setLaidOut] = useState(false);
  const palette = palettes[paletteIndex];
  // Capture at 1080px; the on-screen layout scales uniformly to preserve type.
  const cardWidth = Math.min(width - 48, 360);
  const scale = cardWidth / 360;
  const height = format === "story" ? 640 : 360;
  const wrapped = item.kind === "wrapped";
  const chart = item.kind === "chart";
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      Alert.alert(
        "Couldn't share",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const exportCard = () =>
    run(async () => {
      if (!(await Sharing.isAvailableAsync()))
        throw new Error(
          "Image sharing isn't available on this device. You can still share the link.",
        );
      let uri: string | undefined;
      try {
        uri = await captureRef(card, {
          format: "png",
          quality: 1,
          result: "tmpfile",
          width: 1080,
          height: format === "story" ? 1920 : 1080,
        });
        // Stories can add the copied URL as a link sticker; image attachments
        // alone do not provide a tappable link on social platforms.
        await Clipboard.setStringAsync(shareUrl(item));
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          UTI: "public.png",
          dialogTitle: `Share ${item.title}`,
        });
      } finally {
        if (uri) releaseCapture(uri);
      }
    });
  const shareLink = () =>
    run(() =>
      Share.share(
        Platform.OS === "ios"
          ? {
              message: `${item.title}${item.subtitle ? ` — ${item.subtitle}` : ""}`,
              url: shareUrl(item),
            }
          : { message: shareText(item), title: item.title },
      ),
    );
  const social = (app: "Bluesky" | "X" | "Facebook") =>
    run(() => {
      const text = encodeURIComponent(shareText(item));
      const url = encodeURIComponent(shareUrl(item));
      return Linking.openURL(
        app === "Bluesky"
          ? `https://bsky.app/intent/compose?text=${text}`
          : app === "X"
            ? `https://twitter.com/intent/tweet?text=${text}`
            : `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      );
    });
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel="Close sharing"
          onPress={() => navigation.goBack()}
          hitSlop={12}
        >
          <Feather name="x" color={colors.text} size={24} />
        </TouchableOpacity>
        <Text style={styles.heading}>Make it yours</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.row}>
          {(["story", "square"] as const).map((value) => (
            <TouchableOpacity
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: format === value }}
              onPress={() => {
                if (format !== value) {
                  setFormat(value);
                  setLaidOut(false);
                }
              }}
              disabled={busy}
              style={[styles.pill, format === value && styles.selected]}
            >
              <Text>{value === "story" ? "Story · 9:16" : "Post · 1:1"}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View
          style={{
            width: cardWidth,
            height: height * scale,
            overflow: "hidden",
            borderRadius: 20,
          }}
        >
          <View
            style={{
              width: 360,
              height,
              transform: [{ scale }],
              transformOrigin: "top left",
            }}
          >
            <View
              ref={card}
              collapsable={false}
              onLayout={() => setLaidOut(true)}
              style={{ width: 360, height }}
            >
              <LinearGradient
                colors={palette.colors}
                style={{
                  flex: 1,
                  padding: format === "story" ? 28 : 24,
                  justifyContent: "space-between",
                }}
              >
                <View style={styles.orbit} />
                <View
                  style={[
                    styles.orbit,
                    { top: 240, left: -190, width: 420, height: 420 },
                  ]}
                />
                <View style={styles.brand}>
                  <Feather name="headphones" size={18} color="#fff" />
                  <Text style={styles.wordmark}>rocksky</Text>
                  <Text
                    style={[
                      styles.label,
                      { marginLeft: "auto", color: palette.accent },
                    ]}
                  >
                    {wrapped ? String(item.year) : item.kind.toUpperCase()}
                  </Text>
                </View>
                {wrapped || chart ? (
                  <View style={{ gap: format === "story" ? 20 : 8 }}>
                    <Text
                      style={[
                        styles.cardTitle,
                        { fontSize: format === "story" ? 40 : 26 },
                      ]}
                    >
                      {wrapped ? "Your year.\nOn repeat." : item.title}
                    </Text>
                    <View style={{ flexDirection: "row", gap: 20 }}>
                      {item.stats?.map((stat) => (
                        <View key={stat.label}>
                          <Text
                            style={{
                              color: palette.accent,
                              fontSize: 32,
                              fontWeight: "800",
                            }}
                          >
                            {stat.value}
                          </Text>
                          <Text style={styles.cardSub}>{stat.label}</Text>
                        </View>
                      ))}
                    </View>
                    {item.rankings
                      ?.slice(0, format === "story" ? 2 : 1)
                      .map((group) => (
                        <View key={group.label}>
                          <Text
                            style={[
                              styles.label,
                              { color: palette.accent, marginBottom: 6 },
                            ]}
                          >
                            {group.label.toUpperCase()}
                          </Text>
                          {group.names
                            .slice(0, chart ? 5 : 3)
                            .map((name, i) => (
                              <Text
                                key={`${i}-${name}`}
                                numberOfLines={1}
                                style={{
                                  color: "#fff",
                                  fontSize: 14,
                                  marginBottom: chart ? 10 : 3,
                                }}
                              >
                                {String(i + 1).padStart(2, "0")} {name}
                              </Text>
                            ))}
                        </View>
                      ))}
                  </View>
                ) : (
                  <View style={{ gap: format === "story" ? 24 : 12 }}>
                    <View
                      style={{
                        width: format === "story" ? 304 : 120,
                        height: format === "story" ? 304 : 120,
                        alignSelf: "center",
                        borderRadius:
                          item.kind === "profile" || item.kind === "artist"
                            ? 152
                            : 12,
                        overflow: "hidden",
                        backgroundColor: "#ffffff18",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {item.artwork && !imageFailed ? (
                        <Image
                          source={{ uri: item.artwork }}
                          style={{ width: "100%", height: "100%" }}
                          resizeMode="cover"
                          onLoad={() => setImageReady(true)}
                          onError={() => {
                            setImageFailed(true);
                            setImageReady(true);
                          }}
                        />
                      ) : (
                        <Feather
                          name={item.kind === "profile" ? "user" : "music"}
                          color="#fff"
                          size={72}
                        />
                      )}
                    </View>
                    <View>
                      <Text
                        style={[
                          styles.cardTitle,
                          { fontSize: format === "story" ? 30 : 21 },
                        ]}
                        numberOfLines={2}
                      >
                        {item.title}
                      </Text>
                      {!!item.subtitle && (
                        <Text style={styles.cardSub} numberOfLines={2}>
                          {item.subtitle}
                        </Text>
                      )}
                    </View>
                  </View>
                )}
                <View style={{ gap: 5 }}>
                  <View
                    style={{
                      height: 2,
                      backgroundColor: palette.accent,
                      width: 32,
                      marginBottom: 8,
                    }}
                  />
                  <Text
                    numberOfLines={1}
                    style={{ color: "#fff", fontSize: 12 }}
                  >
                    {wrapped || chart
                      ? item.subtitle
                      : "A little closer to the music."}
                  </Text>
                  <Text style={styles.label}>ROCKSKY.APP</Text>
                </View>
              </LinearGradient>
            </View>
          </View>
        </View>
        <View style={styles.row}>
          {palettes.map((p, i) => (
            <TouchableOpacity
              key={p.name}
              accessibilityRole="button"
              accessibilityLabel={`${p.name} theme`}
              accessibilityState={{ selected: paletteIndex === i }}
              disabled={busy}
              onPress={() => setPaletteIndex(i)}
              style={[
                styles.swatch,
                {
                  backgroundColor: p.colors[0],
                  borderColor: paletteIndex === i ? "white" : "transparent",
                },
              ]}
            />
          ))}
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={busy || !imageReady || !laidOut}
          onPress={exportCard}
          style={[
            styles.primary,
            (busy || !imageReady || !laidOut) && { opacity: 0.5 },
          ]}
        >
          {busy ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Feather name="image" color="white" size={20} />
              <Text style={styles.buttonText}>Share card</Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={styles.note}>
          Choose Instagram, Facebook Stories, Discord, or another installed app.
          The link is copied for a story link sticker.
        </Text>
        <View style={styles.row}>
          <TouchableOpacity
            disabled={busy}
            style={styles.pill}
            onPress={shareLink}
          >
            <Text>Share link…</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={busy}
            style={styles.pill}
            onPress={() =>
              run(async () => {
                await Clipboard.setStringAsync(shareUrl(item));
                Alert.alert("Link copied");
              })
            }
          >
            <Text>Copy link</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.row}>
          {(["Bluesky", "X", "Facebook"] as const).map((app) => (
            <TouchableOpacity
              key={app}
              disabled={busy}
              style={styles.pill}
              onPress={() => social(app)}
            >
              <Text>{app}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
  },
  heading: { color: colors.text, fontSize: 20, fontWeight: "700" },
  content: {
    alignItems: "center",
    gap: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
  },
  pill: {
    borderRadius: 24,
    backgroundColor: colors.surface2,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  selected: { backgroundColor: colors.primary },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 3 },
  primary: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    padding: 16,
    borderRadius: 18,
    backgroundColor: colors.primary,
  },
  buttonText: { color: "white", fontSize: 16, fontWeight: "700" },
  note: {
    color: colors.textMuted,
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18,
    maxWidth: 350,
  },
  orbit: {
    position: "absolute",
    width: 350,
    height: 350,
    borderRadius: 200,
    borderWidth: 1,
    borderColor: "#ffffff1c",
    top: -150,
    right: -140,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 7 },
  wordmark: {
    color: "white",
    fontWeight: "700",
    fontSize: 18,
    letterSpacing: -0.5,
  },
  label: {
    color: "#ffffffb0",
    fontSize: 9,
    letterSpacing: 2,
    fontWeight: "700",
  },
  cardTitle: {
    color: "white",
    fontWeight: "800",
    letterSpacing: -0.7,
    lineHeight: undefined,
  },
  cardSub: { color: "#ffffffe0", fontSize: 14, marginTop: 6 },
});
