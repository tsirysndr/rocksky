import { colors } from "@/src/theme";
import { useAlbumQuery } from "@/src/hooks/useLibrary";
import { RootStackParamList } from "@/src/Navigation";
import { RouteProp, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
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
import { Text } from "@/src/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";

type Props = { route?: RouteProp<RootStackParamList, "AlbumDetails"> };

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

export default function AlbumDetails({ route }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const uri = route?.params?.uri || "";
  const { did, rkey } = parseUri(uri);

  const { data: album, isLoading } = useAlbumQuery(did, rkey);

  const tracks = (album?.tracks as any[]) || [];
  const maxDisc = tracks.length > 0 ? Math.max(...tracks.map((t: any) => t.discNumber || 1)) : 1;
  const multiDisc = maxDisc > 1;

  function TrackRow({ track, i }: { track: any; i: number }) {
    return (
      <TouchableOpacity
        onPress={() => track.uri && navigation.navigate("SongDetails", { uri: track.uri })}
        style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }}
      >
        <Text style={{ width: 28, textAlign: "center", fontSize: 11, opacity: 0.4, color: colors.text }}>
          {track.trackNumber || i + 1}
        </Text>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "500", color: colors.text }}>{track.title}</Text>
          {!!(track.artist || track.albumArtist) && (
            <Text numberOfLines={1} style={{ fontSize: 11, color: colors.textMuted }}>{track.artist || track.albumArtist}</Text>
          )}
        </View>
        {!!track.duration && (
          <Text style={{ fontSize: 11, color: colors.textMuted }}>{formatDuration(track.duration)}</Text>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={{ paddingHorizontal: 16, paddingVertical: 12 }}
      >
        <Text style={{ color: colors.primary, fontSize: 15 }}>← Back</Text>
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {isLoading && (
          <View style={{ alignItems: "center", paddingVertical: 60 }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}

        {!isLoading && album && (
          <>
            {/* Album art + info */}
            <View style={{ alignItems: "center", paddingTop: 16, paddingBottom: 20, paddingHorizontal: 16 }}>
              <View style={{ width: 208, height: 208, borderRadius: 16, overflow: "hidden", backgroundColor: colors.surface2, marginBottom: 20 }}>
                {album.albumArt ? (
                  <Image source={{ uri: album.albumArt }} style={{ width: 208, height: 208 }} />
                ) : (
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 64, opacity: 0.2 }}>💿</Text>
                  </View>
                )}
              </View>

              <Text style={{ fontSize: 22, fontWeight: "800", color: colors.text, textAlign: "center", marginBottom: 8 }}>
                {album.title}
              </Text>

              <TouchableOpacity onPress={() => album.artistUri && navigation.navigate("ArtistDetails", { uri: album.artistUri })}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.primary, marginBottom: 4 }}>
                  {album.artist}
                </Text>
              </TouchableOpacity>

              {album.releaseDate && (
                <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 16 }}>
                  {dayjs(album.releaseDate).format("YYYY")}
                </Text>
              )}

              <View style={{ flexDirection: "row", gap: 40, marginBottom: 16 }}>
                <View style={{ alignItems: "center" }}>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>
                    {numeral(album.uniqueListeners || album.listeners).format("0,0")}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted }}>Listeners</Text>
                </View>
                <View style={{ alignItems: "center" }}>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>
                    {numeral(album.playCount || album.scrobbles).format("0,0")}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted }}>Scrobbles</Text>
                </View>
              </View>

              {/* Genre tags */}
              {album.tags && album.tags.length > 0 && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 16 }}>
                  {(album.tags as string[]).slice(0, 5).map((tag) => (
                    <View key={tag} style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, backgroundColor: colors.surface2 }}>
                      <Text style={{ fontSize: 12, color: colors.genre }}>#{tag}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Share on Bluesky */}
              <TouchableOpacity
                onPress={() => {
                  const link = `https://rocksky.app/${did}/album/${rkey}`;
                  const text = `${album.title} by ${album.artist} on Rocksky 🎵\n${link}`;
                  Linking.openURL(`https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`);
                }}
                style={{ width: "100%", paddingVertical: 14, borderRadius: 14, backgroundColor: colors.surface2, alignItems: "center" }}
              >
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>Share on Bluesky</Text>
              </TouchableOpacity>
            </View>

            {/* Track listing */}
            <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 8 }}>Tracks</Text>

              {tracks.length === 0 && (
                <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: "center", paddingVertical: 32 }}>No tracks found</Text>
              )}

              {!multiDisc && tracks.map((track: any, i: number) => (
                <TrackRow key={track.id || i} track={track} i={i} />
              ))}

              {multiDisc && Array.from({ length: maxDisc }, (_, di) => {
                const discTracks = tracks.filter((t: any) => (t.discNumber || 1) === di + 1);
                return (
                  <View key={di} style={{ marginBottom: 16 }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textMuted, marginTop: 12, marginBottom: 4 }}>
                      Disc {di + 1}
                    </Text>
                    {discTracks.map((track: any, i: number) => (
                      <TrackRow key={track.id || i} track={track} i={i} />
                    ))}
                  </View>
                );
              })}

              {/* Release info */}
              {(album.releaseDate || album.label) && (
                <View style={{ marginTop: 20 }}>
                  {album.releaseDate && (
                    <Text style={{ fontSize: 12, color: colors.textMuted }}>
                      {dayjs(album.releaseDate).format("MMMM D, YYYY")}
                    </Text>
                  )}
                  {album.label && (
                    <Text style={{ fontSize: 12, color: colors.textMuted }}>{album.label}</Text>
                  )}
                </View>
              )}
            </View>
          </>
        )}

        {!isLoading && !album && (
          <View style={{ alignItems: "center", paddingVertical: 80 }}>
            <Text style={{ fontSize: 40, opacity: 0.2, marginBottom: 12 }}>💿</Text>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>Album not found</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
