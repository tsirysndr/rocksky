import { type RouteProp, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import dayjs from "dayjs";
import numeral from "numeral";
import {
  ActivityIndicator,
  Image,
  Linking,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import FloatingShoutBar from "@/src/components/FloatingShoutBar";
import { Text } from "@/src/components/Text";
import { useAlbumQuery } from "@/src/hooks/useLibrary";
import type { RootStackParamList } from "@/src/Navigation";
import { colors } from "@/src/theme";

type Props = { route?: RouteProp<RootStackParamList, "AlbumDetails"> };

type AlbumTrack = {
  id?: string;
  uri?: string;
  title: string;
  artist?: string;
  albumArtist?: string;
  trackNumber?: number;
  discNumber?: number;
  duration?: number;
};

type AlbumDetailsData = {
  title: string;
  artist: string;
  artistUri?: string;
  albumArt?: string;
  releaseDate?: string;
  label?: string;
  uniqueListeners?: number;
  listeners?: number;
  playCount?: number;
  scrobbles?: number;
  tags?: string[];
  tracks?: AlbumTrack[];
};

function parseUri(uri: string) {
  const parts = uri.replace("at://", "").split("/");
  return { did: parts[0], rkey: parts[parts.length - 1] };
}

function formatDuration(ms: number) {
  if (!ms) return "";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function TrackRow({
  track,
  i,
  navigation,
}: {
  track: AlbumTrack;
  i: number;
  navigation: NativeStackNavigationProp<RootStackParamList>;
}) {
  return (
    <TouchableOpacity
      onPress={() =>
        track.uri && navigation.navigate("SongDetails", { uri: track.uri })
      }
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 10,
      }}
    >
      <Text
        style={{
          width: 28,
          textAlign: "center",
          fontSize: 11,
          opacity: 0.4,
          color: colors.text,
        }}
      >
        {track.trackNumber || i + 1}
      </Text>
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{ fontSize: 13, fontWeight: "500", color: colors.text }}
        >
          {track.title}
        </Text>
        {!!(track.artist || track.albumArtist) && (
          <Text
            numberOfLines={1}
            style={{ fontSize: 11, color: colors.textMuted }}
          >
            {track.artist || track.albumArtist}
          </Text>
        )}
      </View>
      {!!track.duration && (
        <Text style={{ fontSize: 11, color: colors.textMuted }}>
          {formatDuration(track.duration)}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export default function AlbumDetails({ route }: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const uri = route?.params?.uri || "";
  const { did, rkey } = parseUri(uri);

  const { data, isLoading } = useAlbumQuery(did, rkey);
  const album: AlbumDetailsData | undefined = data;

  const tracks = album?.tracks || [];
  const maxDisc =
    tracks.length > 0 ? Math.max(...tracks.map((t) => t.discNumber || 1)) : 1;
  const multiDisc = maxDisc > 1;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={{ paddingHorizontal: 16, paddingVertical: 12 }}
      >
        <Text style={{ color: colors.primary, fontSize: 15 }}>← Back</Text>
      </TouchableOpacity>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 96 }}
      >
        {isLoading && (
          <View style={{ alignItems: "center", paddingVertical: 60 }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}

        {!isLoading && album && (
          <>
            {/* Album art + info */}
            <View
              style={{
                alignItems: "center",
                paddingTop: 16,
                paddingBottom: 20,
                paddingHorizontal: 16,
              }}
            >
              <View
                style={{
                  width: 208,
                  height: 208,
                  borderRadius: 16,
                  overflow: "hidden",
                  backgroundColor: colors.surface2,
                  marginBottom: 20,
                }}
              >
                {album.albumArt ? (
                  <Image
                    source={{ uri: album.albumArt }}
                    style={{ width: 208, height: 208 }}
                  />
                ) : (
                  <View
                    style={{
                      flex: 1,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 64, opacity: 0.2 }}>💿</Text>
                  </View>
                )}
              </View>

              <Text
                style={{
                  fontSize: 22,
                  fontWeight: "800",
                  color: colors.text,
                  textAlign: "center",
                  marginBottom: 8,
                }}
              >
                {album.title}
              </Text>

              <TouchableOpacity
                onPress={() =>
                  album.artistUri &&
                  navigation.navigate("ArtistDetails", { uri: album.artistUri })
                }
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "600",
                    color: colors.primary,
                    marginBottom: 4,
                  }}
                >
                  {album.artist}
                </Text>
              </TouchableOpacity>

              {album.releaseDate && (
                <Text
                  style={{
                    fontSize: 13,
                    color: colors.textMuted,
                    marginBottom: 16,
                  }}
                >
                  {dayjs(album.releaseDate).format("YYYY")}
                </Text>
              )}

              <View style={{ flexDirection: "row", gap: 40, marginBottom: 16 }}>
                <View style={{ alignItems: "center" }}>
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: "700",
                      color: colors.text,
                    }}
                  >
                    {numeral(album.uniqueListeners || album.listeners).format(
                      "0,0",
                    )}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted }}>
                    Listeners
                  </Text>
                </View>
                <View style={{ alignItems: "center" }}>
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: "700",
                      color: colors.text,
                    }}
                  >
                    {numeral(album.playCount || album.scrobbles).format("0,0")}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted }}>
                    Scrobbles
                  </Text>
                </View>
              </View>

              {/* Genre tags */}
              {album.tags && album.tags.length > 0 && (
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8,
                    justifyContent: "center",
                    marginBottom: 16,
                  }}
                >
                  {(album.tags as string[]).slice(0, 5).map((tag) => (
                    <View
                      key={tag}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 4,
                        borderRadius: 20,
                        backgroundColor: colors.surface2,
                      }}
                    >
                      <Text style={{ fontSize: 12, color: colors.genre }}>
                        #{tag}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Share */}
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate("ShareCard", {
                    item: {
                      kind: "album",
                      uri,
                      title: album.title,
                      subtitle: album.artist,
                      artwork: album.albumArt,
                    },
                  })
                }
                style={{
                  width: "100%",
                  paddingVertical: 14,
                  borderRadius: 14,
                  backgroundColor: colors.surface2,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 14,
                    fontWeight: "600",
                  }}
                >
                  Share
                </Text>
              </TouchableOpacity>
            </View>

            {/* Track listing */}
            <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: colors.text,
                  marginBottom: 8,
                }}
              >
                Tracks
              </Text>

              {tracks.length === 0 && (
                <Text
                  style={{
                    fontSize: 13,
                    color: colors.textMuted,
                    textAlign: "center",
                    paddingVertical: 32,
                  }}
                >
                  No tracks found
                </Text>
              )}

              {!multiDisc &&
                tracks.map((track, i) => (
                  <TrackRow
                    key={track.id || i}
                    track={track}
                    i={i}
                    navigation={navigation}
                  />
                ))}

              {multiDisc &&
                Array.from({ length: maxDisc }, (_, di) => di + 1).map(
                  (disc) => {
                    const discTracks = tracks.filter(
                      (t) => (t.discNumber || 1) === disc,
                    );
                    return (
                      <View key={disc} style={{ marginBottom: 16 }}>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "600",
                            color: colors.textMuted,
                            marginTop: 12,
                            marginBottom: 4,
                          }}
                        >
                          Disc {disc}
                        </Text>
                        {discTracks.map((track, i) => (
                          <TrackRow
                            key={track.id || i}
                            track={track}
                            i={i}
                            navigation={navigation}
                          />
                        ))}
                      </View>
                    );
                  },
                )}

              {/* Release info */}
              {(album.releaseDate || album.label) && (
                <View style={{ marginTop: 20 }}>
                  {album.releaseDate && (
                    <Text style={{ fontSize: 12, color: colors.textMuted }}>
                      {dayjs(album.releaseDate).format("MMMM D, YYYY")}
                    </Text>
                  )}
                  {album.label && (
                    <Text style={{ fontSize: 12, color: colors.textMuted }}>
                      {album.label}
                    </Text>
                  )}
                </View>
              )}
            </View>
          </>
        )}

        {!isLoading && !album && (
          <View style={{ alignItems: "center", paddingVertical: 80 }}>
            <Text style={{ fontSize: 40, opacity: 0.2, marginBottom: 12 }}>
              💿
            </Text>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>
              Album not found
            </Text>
          </View>
        )}
      </ScrollView>
      <FloatingShoutBar uri={uri} type="album" title={album?.title} />
    </SafeAreaView>
  );
}
