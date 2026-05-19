import { colors } from "@/src/theme";
import { useFeedByUriQuery, useScrobbleByUriQuery } from "@/src/hooks/useFeed";
import { useArtistAlbumsQuery, useArtistTracksQuery, useSongByUriQuery } from "@/src/hooks/useLibrary";
import FloatingShoutBar from "@/src/components/FloatingShoutBar";
import { RootStackParamList } from "@/src/Navigation";
import { RouteProp, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
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

type Props = { route?: RouteProp<RootStackParamList, "SongDetails"> };

function formatDuration(ms: number) {
  if (!ms) return "";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function SongDetails({ route }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const uri = route?.params?.uri || "";

  const isScrobble = uri.includes("app.rocksky.scrobble");
  const songResult = useSongByUriQuery(uri);
  const scrobbleResult = useScrobbleByUriQuery(isScrobble ? uri : "");
  const song = (songResult.data?.title ? songResult.data : scrobbleResult.data) as any;
  const isLoading = songResult.isLoading || scrobbleResult.isLoading;

  const { data: tracks } = useArtistTracksQuery(song?.artistUri || "", 8);
  const { data: albums } = useArtistAlbumsQuery(song?.artistUri || "", 6);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Back button */}
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={{ paddingHorizontal: 16, paddingVertical: 12 }}
      >
        <Text style={{ color: colors.primary, fontSize: 15 }}>← Back</Text>
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 96 }}>
        {isLoading && (
          <View style={{ alignItems: "center", paddingVertical: 60 }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}

        {!isLoading && song && (
          <>
            {/* Album art */}
            <View style={{ alignItems: "center", marginBottom: 24 }}>
              <TouchableOpacity
                onPress={() => song.albumUri && navigation.navigate("AlbumDetails", { uri: song.albumUri })}
                activeOpacity={song.albumUri ? 0.8 : 1}
              >
                {song.cover ? (
                  <Image
                    source={{ uri: song.cover }}
                    style={{ width: 200, height: 200, borderRadius: 16 }}
                  />
                ) : (
                  <View style={{ width: 200, height: 200, borderRadius: 16, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 60, opacity: 0.2 }}>♪</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Title & Artist */}
            <View style={{ alignItems: "center", marginBottom: 24 }}>
              <Text style={{ fontSize: 22, fontWeight: "800", color: colors.text, textAlign: "center", marginBottom: 8 }}>
                {song.title}
              </Text>
              <TouchableOpacity onPress={() => song.artistUri && navigation.navigate("ArtistDetails", { uri: song.artistUri })}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.primary, textAlign: "center" }}>
                  {song.albumArtist || song.artist}
                </Text>
              </TouchableOpacity>
              {song.album && (
                <TouchableOpacity onPress={() => song.albumUri && navigation.navigate("AlbumDetails", { uri: song.albumUri })}>
                  <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>{song.album}</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Stats */}
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 40, paddingVertical: 16, marginBottom: 24, borderRadius: 16, backgroundColor: colors.surface2 }}>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>{numeral(song.listeners).format("0,0")}</Text>
                <Text style={{ fontSize: 11, color: colors.textMuted }}>Listeners</Text>
              </View>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>{numeral(song.scrobbles).format("0,0")}</Text>
                <Text style={{ fontSize: 11, color: colors.textMuted }}>Scrobbles</Text>
              </View>
            </View>

            {/* Tags */}
            {song.tags && song.tags.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                {song.tags.map((tag: string) => (
                  <View key={tag} style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, backgroundColor: colors.surface2 }}>
                    <Text style={{ fontSize: 12, color: colors.genre }}>#{tag}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Links */}
            <View style={{ gap: 10, marginBottom: 24 }}>
              <TouchableOpacity
                onPress={() => {
                  const parts = uri.replace("at://", "").split("/");
                  const link = `https://rocksky.app/${parts[0]}/${isScrobble ? "scrobble" : "song"}/${parts[2]}`;
                  const text = `${isScrobble ? "Just scrobbled" : "Listening to"} ${song.title} by ${song.albumArtist || song.artist} on Rocksky 🎵\n${link}`;
                  Linking.openURL(`https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`);
                }}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.surface2 }}
              >
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>Share on Bluesky</Text>
              </TouchableOpacity>

              {song.spotifyLink && (
                <TouchableOpacity
                  onPress={() => Linking.openURL(song.spotifyLink)}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: "#1DB954" }}
                >
                  <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>Listen on Spotify</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => Linking.openURL(`https://pdsls.dev/${uri.replace("at://", "at/")}`)}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 14, backgroundColor: colors.surface2 }}
              >
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>View on PDSls ↗</Text>
              </TouchableOpacity>
            </View>

            {/* Lyrics */}
            {song.lyrics && (
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 12 }}>Lyrics</Text>
                <Text style={{ fontSize: 13, color: colors.textMuted, lineHeight: 24 }}>
                  {song.lyrics.replace(/\[\d{2}:\d{2}\.\d{2}\]\s*/g, "")}
                </Text>
              </View>
            )}

            {/* Popular Tracks */}
            {tracks && tracks.length > 0 && (
              <View style={{ marginBottom: 24 }}>
                <TouchableOpacity onPress={() => song.artistUri && navigation.navigate("ArtistDetails", { uri: song.artistUri })}>
                  <Text style={{ fontSize: 14, color: colors.textMuted }}>Popular Tracks by</Text>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text, marginBottom: 12 }}>{song.albumArtist || song.artist}</Text>
                </TouchableOpacity>
                {(tracks as any[]).map((track: any, i: number) => (
                  <TouchableOpacity
                    key={track.id || i}
                    style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 }}
                    onPress={() => track.uri && navigation.navigate("SongDetails", { uri: track.uri })}
                  >
                    <Text style={{ width: 20, textAlign: "center", fontSize: 11, opacity: 0.4, color: colors.text }}>{i + 1}</Text>
                    <View style={{ width: 40, height: 40, borderRadius: 6, overflow: "hidden", backgroundColor: colors.surface2 }}>
                      {(track.albumArt || track.album_art) ? (
                        <Image source={{ uri: track.albumArt || track.album_art }} style={{ width: 40, height: 40 }} />
                      ) : (
                        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Text style={{ opacity: 0.2 }}>♪</Text></View>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "500", color: colors.text }}>{track.title}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Popular Albums */}
            {albums && albums.length > 0 && (
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 14, color: colors.textMuted }}>Popular Albums by</Text>
                <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text, marginBottom: 12 }}>{song.albumArtist || song.artist}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                  {(albums as any[]).map((album: any) => (
                    <TouchableOpacity
                      key={album.id || album.uri}
                      style={{ width: "45%" }}
                      onPress={() => album.uri && navigation.navigate("AlbumDetails", { uri: album.uri })}
                    >
                      <View style={{ aspectRatio: 1, borderRadius: 10, overflow: "hidden", backgroundColor: colors.surface2, marginBottom: 4 }}>
                        {(album.albumArt || album.album_art) ? (
                          <Image source={{ uri: album.albumArt || album.album_art }} style={{ width: "100%", height: "100%" }} />
                        ) : (
                          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Text style={{ opacity: 0.2 }}>💿</Text></View>
                        )}
                      </View>
                      <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: "600", color: colors.text }}>{album.title}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        {!isLoading && !song && (
          <View style={{ alignItems: "center", paddingVertical: 80 }}>
            <Text style={{ fontSize: 40, opacity: 0.2, marginBottom: 12 }}>♪</Text>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>Song not found</Text>
          </View>
        )}
      </ScrollView>
      <FloatingShoutBar
        uri={uri}
        type={isScrobble ? "scrobble" : "song"}
        title={song?.title}
      />
    </SafeAreaView>
  );
}
