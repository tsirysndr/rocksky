import { colors } from "@/src/theme";
import { useArtistAlbumsQuery, useArtistQuery, useArtistTracksQuery } from "@/src/hooks/useLibrary";
import FloatingShoutBar from "@/src/components/FloatingShoutBar";
import { RootStackParamList } from "@/src/Navigation";
import { RouteProp, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import numeral from "numeral";
import { useState } from "react";
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

type Props = { route?: RouteProp<RootStackParamList, "ArtistDetails"> };

function parseUri(uri: string) {
  const parts = uri.replace("at://", "").split("/");
  return { did: parts[0], rkey: parts[parts.length - 1] };
}

export default function ArtistDetails({ route }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const uri = route?.params?.uri || "";
  const { did, rkey } = parseUri(uri);
  const [tab, setTab] = useState<"tracks" | "albums">("tracks");

  const { data: artist, isLoading } = useArtistQuery(did, rkey);
  const { data: tracks } = useArtistTracksQuery(artist?.uri || "", 10);
  const { data: albums } = useArtistAlbumsQuery(artist?.uri || "", 10);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={{ paddingHorizontal: 16, paddingVertical: 12 }}
      >
        <Text style={{ color: colors.primary, fontSize: 15 }}>← Back</Text>
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 96 }}>
        {isLoading && (
          <View style={{ alignItems: "center", paddingVertical: 60 }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}

        {!isLoading && artist && (
          <>
            {/* Hero */}
            <View style={{ alignItems: "center", paddingTop: 16, paddingBottom: 20, paddingHorizontal: 16 }}>
              <View style={{ width: 144, height: 144, borderRadius: 72, overflow: "hidden", backgroundColor: colors.surface2, marginBottom: 16 }}>
                {artist.picture ? (
                  <Image source={{ uri: artist.picture }} style={{ width: 144, height: 144 }} />
                ) : (
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 56, opacity: 0.2 }}>♬</Text>
                  </View>
                )}
              </View>

              <Text style={{ fontSize: 22, fontWeight: "800", color: colors.text, textAlign: "center", marginBottom: 16 }}>
                {artist.name}
              </Text>

              <View style={{ flexDirection: "row", gap: 40, marginBottom: 16 }}>
                <View style={{ alignItems: "center" }}>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>
                    {numeral(artist.uniqueListeners || artist.listeners).format("0,0")}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted }}>Listeners</Text>
                </View>
                <View style={{ alignItems: "center" }}>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>
                    {numeral(artist.playCount || artist.scrobbles).format("0,0")}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted }}>Scrobbles</Text>
                </View>
              </View>

              {/* Genre tags */}
              {artist.tags && artist.tags.length > 0 && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 16 }}>
                  {(artist.tags as string[]).slice(0, 5).map((tag) => (
                    <View key={tag} style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, backgroundColor: colors.surface2 }}>
                      <Text style={{ fontSize: 12, color: colors.genre }}>#{tag}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Share on Bluesky */}
              <TouchableOpacity
                onPress={() => {
                  const link = `https://rocksky.app/${did}/artist/${rkey}`;
                  const text = `Listening to ${artist.name} on Rocksky 🎵\n${link}`;
                  Linking.openURL(`https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`);
                }}
                style={{ width: "100%", paddingVertical: 14, borderRadius: 14, backgroundColor: colors.surface2, alignItems: "center" }}
              >
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>Share on Bluesky</Text>
              </TouchableOpacity>
            </View>

            {/* Tabs */}
            <View style={{ flexDirection: "row" }}>
              {(["tracks", "albums"] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setTab(t)}
                  style={{ flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2, borderBottomColor: tab === t ? colors.primary : "transparent" }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: tab === t ? colors.primary : colors.textMuted }}>
                    {t === "tracks" ? "Popular Songs" : "Albums"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Track list */}
            {tab === "tracks" && (
              <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
                {(!tracks || tracks.length === 0) && (
                  <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: "center", paddingVertical: 32 }}>No tracks found</Text>
                )}
                {(tracks as any[] || []).map((track: any, i: number) => (
                  <TouchableOpacity
                    key={track.id || i}
                    onPress={() => track.uri && navigation.navigate("SongDetails", { uri: track.uri })}
                    style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }}
                  >
                    <Text style={{ width: 20, textAlign: "center", fontSize: 11, opacity: 0.4, color: colors.text }}>{i + 1}</Text>
                    <View style={{ width: 40, height: 40, borderRadius: 6, overflow: "hidden", backgroundColor: colors.surface2 }}>
                      {(track.albumArt || track.album_art || track.cover) ? (
                        <Image source={{ uri: track.albumArt || track.album_art || track.cover }} style={{ width: 40, height: 40 }} />
                      ) : (
                        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ opacity: 0.2 }}>♪</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "500", color: colors.text }}>{track.title}</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: colors.textMuted }}>
                      {numeral(track.playCount || track.scrobbles).format("0,0")}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Album grid */}
            {tab === "albums" && (
              <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
                {(!albums || albums.length === 0) && (
                  <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: "center", paddingVertical: 32 }}>No albums found</Text>
                )}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                  {(albums as any[] || []).map((album: any, i: number) => (
                    <TouchableOpacity
                      key={album.id || album.uri || i}
                      style={{ width: "47%" }}
                      onPress={() => album.uri && navigation.navigate("AlbumDetails", { uri: album.uri })}
                    >
                      <View style={{ aspectRatio: 1, borderRadius: 10, overflow: "hidden", backgroundColor: colors.surface2, marginBottom: 4 }}>
                        {(album.albumArt || album.album_art) ? (
                          <Image source={{ uri: album.albumArt || album.album_art }} style={{ width: "100%", height: "100%" }} />
                        ) : (
                          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ fontSize: 32, opacity: 0.2 }}>💿</Text>
                          </View>
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

        {!isLoading && !artist && (
          <View style={{ alignItems: "center", paddingVertical: 80 }}>
            <Text style={{ fontSize: 40, opacity: 0.2, marginBottom: 12 }}>♬</Text>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>Artist not found</Text>
          </View>
        )}
      </ScrollView>
      <FloatingShoutBar uri={uri} type="artist" title={artist?.name} />
    </SafeAreaView>
  );
}
