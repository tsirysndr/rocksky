import { profileAtom } from "@/src/atoms/profile";
import { Text } from "@/src/components/Text";
import {
  useAlbumRecommendationsQuery,
  useArtistRecommendationsQuery,
  useTrackRecommendationsQuery,
  type AlbumRecommendation,
  type ArtistRecommendation,
  type TrackRecommendation,
} from "@/src/hooks/useRecommendations";
import { RootStackParamList } from "@/src/Navigation";
import { colors } from "@/src/theme";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { Image } from "expo-image";
import { useAtomValue } from "jotai";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  TouchableOpacity,
  View,
} from "react-native";

function sourceLabel(source?: string): { text: string; bg: string; fg: string } {
  switch (source) {
    case "neighbour":
    case "known-artist":
      return { text: source === "neighbour" ? "Neighbour" : "Known artist", bg: "#16a34a22", fg: "#16a34a" };
    case "new-artist":
    case "social":
      return { text: source === "new-artist" ? "New artist" : "Social", bg: "#2563eb22", fg: "#2563eb" };
    case "serendipity":
      return { text: "Serendipity", bg: "#7c3aed22", fg: "#7c3aed" };
    default:
      return { text: "For you", bg: `${colors.textMuted}22`, fg: colors.textMuted };
  }
}

function SourceBadge({ source }: { source?: string }) {
  const { text, bg, fg } = sourceLabel(source);
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
      <Text style={{ fontSize: 10, fontWeight: "700", color: fg }}>{text}</Text>
    </View>
  );
}

function TrackRow({
  item,
  onPress,
}: {
  item: TrackRecommendation;
  onPress: (uri: string) => void;
}) {
  const cover = item.albumArt;
  return (
    <TouchableOpacity
      onPress={() => item.trackUri && onPress(item.trackUri)}
      style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 16, gap: 12 }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 8, overflow: "hidden", backgroundColor: colors.surface2 }}>
        {cover ? (
          <Image source={{ uri: cover }} style={{ width: 44, height: 44 }} />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ opacity: 0.2, fontSize: 18 }}>♪</Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>{item.title}</Text>
        <Text numberOfLines={1} style={{ fontSize: 12, color: colors.textMuted }}>
          {item.artist}{item.album ? ` — ${item.album}` : ""}
        </Text>
      </View>
      <SourceBadge source={item.source} />
    </TouchableOpacity>
  );
}

function ArtistRow({
  item,
  onPress,
}: {
  item: ArtistRecommendation;
  onPress: (uri: string) => void;
}) {
  return (
    <TouchableOpacity
      onPress={() => item.uri && onPress(item.uri)}
      style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 16, gap: 12 }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 22, overflow: "hidden", backgroundColor: colors.surface2 }}>
        {item.picture ? (
          <Image source={{ uri: item.picture }} style={{ width: 44, height: 44 }} />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ opacity: 0.2, fontSize: 18 }}>♬</Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>{item.name}</Text>
        {item.genres && item.genres.length > 0 && (
          <Text numberOfLines={1} style={{ fontSize: 12, color: colors.textMuted }}>
            {item.genres.slice(0, 3).join(", ")}
          </Text>
        )}
      </View>
      <SourceBadge source={item.source} />
    </TouchableOpacity>
  );
}

function AlbumRow({
  item,
  onPress,
}: {
  item: AlbumRecommendation;
  onPress: (uri: string) => void;
}) {
  return (
    <TouchableOpacity
      onPress={() => item.uri && onPress(item.uri)}
      style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 16, gap: 12 }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 8, overflow: "hidden", backgroundColor: colors.surface2 }}>
        {item.albumArt ? (
          <Image source={{ uri: item.albumArt }} style={{ width: 44, height: 44 }} />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ opacity: 0.2, fontSize: 18 }}>💿</Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>{item.title}</Text>
        <Text numberOfLines={1} style={{ fontSize: 12, color: colors.textMuted }}>
          {item.artist}{item.year ? ` · ${item.year}` : ""}
        </Text>
      </View>
      <SourceBadge source={item.source} />
    </TouchableOpacity>
  );
}

export default function Recommendations() {
  const profile = useAtomValue(profileAtom);
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const [tab, setTab] = useState<"tracks" | "artists" | "albums">("tracks");

  const did = profile?.did;
  const { data: tracks, isLoading: tracksLoading } = useTrackRecommendationsQuery(did);
  const { data: artists, isLoading: artistsLoading } = useArtistRecommendationsQuery(did);
  const { data: albums, isLoading: albumsLoading } = useAlbumRecommendationsQuery(did);

  const onPressTrack = (uri: string) => {
    navigation.navigate("SongDetails", { uri: `at://${uri.replace("at://", "")}` });
  };

  const onPressArtist = (uri: string) => {
    navigation.navigate("ArtistDetails", { uri: `at://${uri.replace("at://", "")}` });
  };

  const onPressAlbum = (uri: string) => {
    navigation.navigate("AlbumDetails", { uri: `at://${uri.replace("at://", "")}` });
  };

  if (!profile) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: colors.text, textAlign: "center", marginBottom: 8 }}>
          Sign in to see your recommendations
        </Text>
        <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: "center" }}>
          Personalised picks based on your scrobble history.
        </Text>
      </SafeAreaView>
    );
  }

  const loading =
    tab === "tracks" ? tracksLoading : tab === "artists" ? artistsLoading : albumsLoading;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
        <Text style={{ fontSize: 24, fontWeight: "800", color: colors.text, marginBottom: 16 }}>
          For You
        </Text>

        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["tracks", "artists", "albums"] as const).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: 20,
                backgroundColor: tab === t ? colors.primary : colors.surface2,
              }}
            >
              <Text style={{
                fontSize: 13,
                fontWeight: "600",
                color: tab === t ? "#fff" : colors.textMuted,
                textTransform: "capitalize",
              }}>
                {t}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : tab === "tracks" ? (
        <FlatList
          data={tracks ?? []}
          keyExtractor={(item, i) => item.trackUri ?? String(i)}
          renderItem={({ item }) => <TrackRow item={item} onPress={onPressTrack} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={{ padding: 16, color: colors.textMuted, fontSize: 14 }}>
              Scrobble more tracks to unlock recommendations.
            </Text>
          }
        />
      ) : tab === "artists" ? (
        <FlatList
          data={artists ?? []}
          keyExtractor={(item, i) => item.id ?? String(i)}
          renderItem={({ item }) => <ArtistRow item={item} onPress={onPressArtist} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={{ padding: 16, color: colors.textMuted, fontSize: 14 }}>
              Scrobble more tracks to unlock recommendations.
            </Text>
          }
        />
      ) : (
        <FlatList
          data={albums ?? []}
          keyExtractor={(item, i) => item.id ?? String(i)}
          renderItem={({ item }) => <AlbumRow item={item} onPress={onPressAlbum} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={{ padding: 16, color: colors.textMuted, fontSize: 14 }}>
              Scrobble more tracks to unlock recommendations.
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}
