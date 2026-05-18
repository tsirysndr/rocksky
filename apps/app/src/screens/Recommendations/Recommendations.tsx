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
import React, { useState } from "react";
import {
  FlatList,
  SafeAreaView,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import ContentLoader, { Circle, Rect } from "react-content-loader/native";

function ListSkeleton({ width }: { width: number }) {
  const ROW_H = 80;
  const ROWS = 8;
  return (
    <ContentLoader
      width={width}
      height={ROW_H * ROWS}
      backgroundColor={colors.skeletonBackground}
      foregroundColor={colors.skeletonForeground}
    >
      {Array.from({ length: ROWS }).map((_, i) => {
        const y = i * ROW_H;
        return (
          <React.Fragment key={i}>
            {/* rank */}
            <Rect x="16" y={y + 33} rx="3" ry="3" width="16" height="12" />
            {/* image */}
            <Rect x="48" y={y + 10} rx="6" ry="6" width="60" height="60" />
            {/* title */}
            <Rect x="120" y={y + 20} rx="3" ry="3" width={width * 0.38} height="14" />
            {/* subtitle */}
            <Rect x="120" y={y + 44} rx="3" ry="3" width={width * 0.25} height="11" />
            {/* badge */}
            <Rect x={width - 110} y={y + 28} rx="10" ry="10" width="94" height="20" />
          </React.Fragment>
        );
      })}
    </ContentLoader>
  );
}

function ArtistSkeleton({ width }: { width: number }) {
  const ROW_H = 80;
  const ROWS = 8;
  return (
    <ContentLoader
      width={width}
      height={ROW_H * ROWS}
      backgroundColor={colors.skeletonBackground}
      foregroundColor={colors.skeletonForeground}
    >
      {Array.from({ length: ROWS }).map((_, i) => {
        const y = i * ROW_H;
        return (
          <React.Fragment key={i}>
            {/* rank */}
            <Rect x="16" y={y + 33} rx="3" ry="3" width="16" height="12" />
            {/* avatar circle */}
            <Circle cx="78" cy={y + 40} r="30" />
            {/* name */}
            <Rect x="120" y={y + 22} rx="3" ry="3" width={width * 0.38} height="14" />
            {/* genres */}
            <Rect x="120" y={y + 44} rx="3" ry="3" width={width * 0.22} height="11" />
            {/* badge */}
            <Rect x={width - 110} y={y + 28} rx="10" ry="10" width="94" height="20" />
          </React.Fragment>
        );
      })}
    </ContentLoader>
  );
}

function sourceLabel(source?: string): { text: string; bg: string; fg: string } {
  switch (source) {
    case "neighbour":
    case "known-artist":
      return {
        text: source === "neighbour" ? "Neighbour" : "Known artist",
        bg: "#16a34a22",
        fg: "#16a34a",
      };
    case "new-artist":
    case "social":
      return {
        text: source === "new-artist" ? "New artist" : "Social",
        bg: "#2563eb22",
        fg: "#2563eb",
      };
    case "serendipity":
      return { text: "Serendipity", bg: "#7c3aed22", fg: "#7c3aed" };
    default:
      return {
        text: "For you",
        bg: `${colors.textMuted}22`,
        fg: colors.textMuted,
      };
  }
}

function SourceBadge({ source }: { source?: string }) {
  const { text, bg, fg } = sourceLabel(source);
  return (
    <View
      style={{
        backgroundColor: bg,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 20,
      }}
    >
      <Text style={{ fontSize: 10, fontWeight: "700", color: fg }}>{text}</Text>
    </View>
  );
}

function TrackRow({
  item,
  rank,
  onPress,
}: {
  item: TrackRecommendation;
  rank: number;
  onPress: (uri: string) => void;
}) {
  return (
    <TouchableOpacity
      onPress={() => item.trackUri && onPress(item.trackUri)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 16,
        gap: 12,
      }}
    >
      <Text
        style={{
          width: 20,
          textAlign: "center",
          fontSize: 13,
          color: colors.textMuted,
          opacity: 0.6,
        }}
      >
        {rank}
      </Text>
      <View
        style={{
          width: 60,
          height: 60,
          borderRadius: 6,
          overflow: "hidden",
          backgroundColor: colors.surface2,
        }}
      >
        {item.albumArt ? (
          <Image
            source={{ uri: item.albumArt }}
            style={{ width: 60, height: 60 }}
          />
        ) : (
          <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ opacity: 0.2, fontSize: 20 }}>♪</Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{ fontSize: 14, fontWeight: "600", color: colors.text }}
        >
          {item.title}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 12, color: colors.textMuted }}>
          {item.artist}
          {item.album ? ` — ${item.album}` : ""}
        </Text>
      </View>
      <SourceBadge source={item.source} />
    </TouchableOpacity>
  );
}

function ArtistRow({
  item,
  rank,
  onPress,
}: {
  item: ArtistRecommendation;
  rank: number;
  onPress: (uri: string) => void;
}) {
  return (
    <TouchableOpacity
      onPress={() => item.uri && onPress(item.uri)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 16,
        gap: 12,
      }}
    >
      <Text
        style={{
          width: 20,
          textAlign: "center",
          fontSize: 13,
          color: colors.textMuted,
          opacity: 0.6,
        }}
      >
        {rank}
      </Text>
      <View
        style={{
          width: 60,
          height: 60,
          borderRadius: 30,
          overflow: "hidden",
          backgroundColor: colors.surface2,
        }}
      >
        {item.picture ? (
          <Image
            source={{ uri: item.picture }}
            style={{ width: 60, height: 60 }}
          />
        ) : (
          <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ opacity: 0.2, fontSize: 20 }}>♬</Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{ fontSize: 14, fontWeight: "600", color: colors.text }}
        >
          {item.name}
        </Text>
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
  rank,
  onPress,
}: {
  item: AlbumRecommendation;
  rank: number;
  onPress: (uri: string) => void;
}) {
  return (
    <TouchableOpacity
      onPress={() => item.uri && onPress(item.uri)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 16,
        gap: 12,
      }}
    >
      <Text
        style={{
          width: 20,
          textAlign: "center",
          fontSize: 13,
          color: colors.textMuted,
          opacity: 0.6,
        }}
      >
        {rank}
      </Text>
      <View
        style={{
          width: 60,
          height: 60,
          borderRadius: 6,
          overflow: "hidden",
          backgroundColor: colors.surface2,
        }}
      >
        {item.albumArt ? (
          <Image
            source={{ uri: item.albumArt }}
            style={{ width: 60, height: 60 }}
          />
        ) : (
          <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ opacity: 0.2, fontSize: 20 }}>💿</Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{ fontSize: 14, fontWeight: "600", color: colors.text }}
        >
          {item.title}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 12, color: colors.textMuted }}>
          {item.artist}
          {item.year ? ` · ${item.year}` : ""}
        </Text>
      </View>
      <SourceBadge source={item.source} />
    </TouchableOpacity>
  );
}

export default function Recommendations() {
  const profile = useAtomValue(profileAtom);
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<"tracks" | "artists" | "albums">("tracks");

  const did = profile?.did;
  const { data: tracks, isLoading: tracksLoading } =
    useTrackRecommendationsQuery(did);
  const { data: artists, isLoading: artistsLoading } =
    useArtistRecommendationsQuery(did);
  const { data: albums, isLoading: albumsLoading } =
    useAlbumRecommendationsQuery(did);

  const onPressTrack = (uri: string) => {
    navigation.navigate("SongDetails", {
      uri: `at://${uri.replace("at://", "")}`,
    });
  };
  const onPressArtist = (uri: string) => {
    navigation.navigate("ArtistDetails", {
      uri: `at://${uri.replace("at://", "")}`,
    });
  };
  const onPressAlbum = (uri: string) => {
    navigation.navigate("AlbumDetails", {
      uri: `at://${uri.replace("at://", "")}`,
    });
  };

  if (!profile) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <Text
          style={{
            fontSize: 16,
            fontWeight: "600",
            color: colors.text,
            textAlign: "center",
            marginBottom: 8,
          }}
        >
          Sign in to see your recommendations
        </Text>
        <Text
          style={{ fontSize: 13, color: colors.textMuted, textAlign: "center" }}
        >
          Personalised picks based on your scrobble history.
        </Text>
      </SafeAreaView>
    );
  }

  const loading =
    tab === "tracks"
      ? tracksLoading
      : tab === "artists"
        ? artistsLoading
        : albumsLoading;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
        <Text
          style={{
            fontSize: 22,
            fontWeight: "800",
            color: colors.text,
            marginBottom: 14,
          }}
        >
          For You
        </Text>

        {/* Tab pills */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["tracks", "artists", "albums"] as const).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: 20,
                backgroundColor:
                  tab === t ? colors.primary : colors.surface2,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: tab === t ? "#fff" : colors.textMuted,
                  textTransform: "capitalize",
                }}
              >
                {t}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        tab === "artists" ? (
          <ArtistSkeleton width={width} />
        ) : (
          <ListSkeleton width={width} />
        )
      ) : tab === "tracks" ? (
        <FlatList
          data={tracks ?? []}
          keyExtractor={(item, i) => item.trackUri ?? String(i)}
          renderItem={({ item, index }) => (
            <TrackRow item={item} rank={index + 1} onPress={onPressTrack} />
          )}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text
              style={{
                padding: 16,
                color: colors.textMuted,
                fontSize: 14,
                textAlign: "center",
              }}
            >
              Scrobble more tracks to unlock recommendations.
            </Text>
          }
        />
      ) : tab === "artists" ? (
        <FlatList
          data={artists ?? []}
          keyExtractor={(item, i) => item.id ?? String(i)}
          renderItem={({ item, index }) => (
            <ArtistRow item={item} rank={index + 1} onPress={onPressArtist} />
          )}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text
              style={{
                padding: 16,
                color: colors.textMuted,
                fontSize: 14,
                textAlign: "center",
              }}
            >
              Scrobble more tracks to unlock recommendations.
            </Text>
          }
        />
      ) : (
        <FlatList
          data={albums ?? []}
          keyExtractor={(item, i) => item.id ?? String(i)}
          renderItem={({ item, index }) => (
            <AlbumRow item={item} rank={index + 1} onPress={onPressAlbum} />
          )}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text
              style={{
                padding: 16,
                color: colors.textMuted,
                fontSize: 14,
                textAlign: "center",
              }}
            >
              Scrobble more tracks to unlock recommendations.
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}
