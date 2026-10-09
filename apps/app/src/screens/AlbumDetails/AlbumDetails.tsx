import type { AlbumDiscogsView } from "@rocksky/sdk";
import DiscogsDetails, { discogsUrl } from "@/src/components/DiscogsDetails";
import Feather from "@expo/vector-icons/Feather";
import { Image as BackgroundImage } from "expo-image";
import { type RouteProp, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import dayjs from "dayjs";
import numeral from "numeral";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
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
  discogs?: AlbumDiscogsView;
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

  const discogs = album?.discogs;
  const formats =
    discogs?.formats?.map((format) => format.trim()).filter(Boolean) ?? [];
  const discogsLinks = discogs
    ? [
        {
          label: "View on Discogs",
          url: discogsUrl(discogs.url, discogs.releaseId),
        },
        {
          label: "View master release",
          url: discogsUrl(
            discogs.master?.url,
            discogs.master?.masterId ?? discogs.masterId,
            "master",
          ),
        },
      ].filter((link) => !!link.url)
    : [];
  const tracks = album?.tracks || [];
  const maxDisc =
    tracks.length > 0 ? Math.max(...tracks.map((t) => t.discNumber || 1)) : 1;
  const multiDisc = maxDisc > 1;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {album?.albumArt ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={StyleSheet.absoluteFill}
        >
          <BackgroundImage
            source={album?.albumArt}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={40}
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(19,8,37,0.82)" },
            ]}
          />
        </View>
      ) : null}
      <SafeAreaView style={{ flex: 1 }}>
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
                    marginBottom: formats.length > 0 ? 12 : 20,
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

                {formats.length > 0 && (
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 13,
                      lineHeight: 19,
                      textAlign: "center",
                      maxWidth: 208,
                      marginBottom: 20,
                    }}
                  >
                    {formats.join(" · ")}
                  </Text>
                )}

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
                    navigation.navigate("ArtistDetails", {
                      uri: album.artistUri,
                    })
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

                <View
                  style={{ flexDirection: "row", gap: 40, marginBottom: 16 }}
                >
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
                      {numeral(album.playCount || album.scrobbles).format(
                        "0,0",
                      )}
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

                {discogsLinks.length > 0 && (
                  <View style={{ width: "100%", gap: 8, marginBottom: 12 }}>
                    {discogsLinks.map((link) => (
                      <TouchableOpacity
                        key={link.label}
                        accessibilityRole="link"
                        accessibilityLabel={link.label}
                        onPress={() =>
                          Linking.openURL(link.url!).catch(() =>
                            Alert.alert(
                              "Could not open link",
                              "Please try again.",
                            ),
                          )
                        }
                        style={{
                          minHeight: 44,
                          paddingVertical: 12,

                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                        }}
                      >
                        <Feather
                          name="external-link"
                          size={16}
                          color={colors.primary}
                        />
                        <Text
                          style={{
                            color: colors.primary,
                            fontSize: 14,
                            textDecorationLine: "underline",
                            flexShrink: 1,
                          }}
                        >
                          {link.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Share */}
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Share album"
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
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <Feather name="share-2" size={18} color={colors.text} />
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

                <DiscogsDetails key={uri} discogs={album.discogs} />

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
        <FloatingShoutBar
          uri={uri}
          type="album"
          title={album?.title}
          picture={album?.albumArt}
        />
      </SafeAreaView>
    </View>
  );
}
