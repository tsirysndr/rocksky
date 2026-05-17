import { followsAtom } from "@/src/atoms/follows";
import { profileAtom } from "@/src/atoms/profile";
import { colors } from "@/src/theme";
import {
  useFollowAccountMutation,
  useFollowersInfiniteQuery,
  useFollowersQuery,
  useFollowsInfiniteQuery,
  useFollowsQuery,
  useUnfollowAccountMutation,
} from "@/src/hooks/useGraph";
import {
  useAlbumsQuery,
  useArtistsQuery,
  useLovedTracksQuery,
  useTracksQuery,
} from "@/src/hooks/useLibrary";
import {
  useActorNeighboursQuery,
  useProfileByDidQuery,
  useProfileStatsByDidQuery,
  useRecentTracksByDidQuery,
} from "@/src/hooks/useProfile";
import { RootStackParamList } from "@/src/Navigation";
import { storage } from "@/src/storage";
import { RouteProp, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useAtom, useAtomValue } from "jotai";
import numeral from "numeral";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { Text } from "@/src/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";

dayjs.extend(relativeTime);

type ProfileRoute = RouteProp<RootStackParamList, "Profile" | "UserProfile">;

function toPath(uri?: string) {
  if (!uri) return null;
  return uri.replace("at://", "").split("/");
}

function imgUrl(track: any): string {
  return track.cover || track.album_art || track.albumArt || "";
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

function Avatar({ uri, name, size = 48 }: { uri?: string; name?: string; size?: number }) {
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
  }, [uri]);

  if (uri && !error) {
    return (
      <Image
        source={uri}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        onError={() => setError(true)}
        contentFit="cover"
      />
    );
  }
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: colors.avatarBackground,
      alignItems: "center", justifyContent: "center",
    }}>
      <Text style={{ color: "#fff", fontSize: size * 0.35 }}>
        {(name || "?")[0]?.toUpperCase()}
      </Text>
    </View>
  );
}

// ─── User card ───────────────────────────────────────────────────────────────

function UserCard({ user, navigation }: { user: any; navigation: NativeStackNavigationProp<RootStackParamList> }) {
  const currentDid = storage.getDid();
  const [follows, setFollows] = useAtom(followsAtom);
  const { mutate: follow } = useFollowAccountMutation();
  const { mutate: unfollow } = useUnfollowAccountMutation();
  const isFollowing = follows.has(user.did);
  const isMe = user.did === currentDid;

  return (
    <TouchableOpacity
      style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, gap: 12 }}
      onPress={() => navigation.navigate("UserProfile", { did: user.did })}
    >
      <Avatar uri={user.avatar} name={user.displayName || user.handle} size={48} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>{user.displayName || user.handle}</Text>
        <Text style={{ fontSize: 12, color: colors.primary }}>@{user.handle}</Text>
      </View>
      {!isMe && currentDid && (
        <TouchableOpacity
          onPress={() => {
            if (isFollowing) {
              setFollows((p) => { const n = new Set(p); n.delete(user.did); return n; });
              unfollow(user.did);
            } else {
              setFollows((p) => new Set(p).add(user.did));
              follow(user.did);
            }
          }}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 6,
            borderRadius: 20,
            backgroundColor: isFollowing ? colors.surface2 : colors.primary,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "600", color: isFollowing ? colors.text : "#fff" }}>
            {isFollowing ? "Following" : "Follow"}
          </Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ did, navigation }: { did: string; navigation: NativeStackNavigationProp<RootStackParamList> }) {
  const [refreshing, setRefreshing] = useState(false);
  const { data: recentTracks, refetch: refetchRecent } = useRecentTracksByDidQuery(did, 0, 20);
  const { data: artists, refetch: refetchArtists } = useArtistsQuery(did, 0, 5);
  const { data: albums, refetch: refetchAlbums } = useAlbumsQuery(did, 0, 6);
  const { data: tracks, refetch: refetchTracks } = useTracksQuery(did, 0, 10);

  const artistList = Array.isArray(artists) ? artists : (artists as any)?.artists ?? [];
  const albumList = Array.isArray(albums) ? albums : (albums as any)?.albums ?? [];
  const trackList = Array.isArray(tracks) ? tracks : (tracks as any)?.tracks ?? [];

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchRecent(), refetchArtists(), refetchAlbums(), refetchTracks()]);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* Recent Listens */}
      <Text style={{ fontSize: 11, fontWeight: "700", color: colors.textMuted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8, marginTop: 16 }}>
        Recent Listens
      </Text>
      {(recentTracks || []).map((track: any, i: number) => {
        const cover = imgUrl(track);
        const uri = track.uri || track.song_uri;
        const parts = toPath(uri);
        return (
          <TouchableOpacity
            key={String(track.id || i)}
            style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 12 }}
            onPress={() => uri && navigation.navigate("SongDetails", { uri })}
          >
            <View style={{ width: 40, height: 40, borderRadius: 6, overflow: "hidden", backgroundColor: colors.surface2 }}>
              {cover ? <Image source={{ uri: cover }} style={{ width: 40, height: 40 }} /> : (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Text style={{ opacity: 0.2 }}>♪</Text></View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "500", color: colors.text }}>{track.title}</Text>
              <Text numberOfLines={1} style={{ fontSize: 11, color: colors.textMuted }}>{track.artist || track.album_artist}</Text>
            </View>
            <Text style={{ fontSize: 10, color: colors.textMuted }}>{dayjs(track.created_at || track.date || track.createdAt).fromNow()}</Text>
          </TouchableOpacity>
        );
      })}

      {/* Top Artists */}
      {artistList.length > 0 && (
        <>
          <Text style={{ fontSize: 11, fontWeight: "700", color: colors.textMuted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8, marginTop: 20 }}>
            Top Artists
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            {artistList.map((a: any) => (
              <TouchableOpacity
                key={a.id || a.uri}
                style={{ alignItems: "center", marginRight: 16, width: 68 }}
                onPress={() => a.uri && navigation.navigate("ArtistDetails", { uri: a.uri })}
              >
                <View style={{ width: 60, height: 60, borderRadius: 30, overflow: "hidden", backgroundColor: colors.surface2, marginBottom: 4 }}>
                  {(a.picture || a.photo) ? <Image source={{ uri: a.picture || a.photo }} style={{ width: 60, height: 60 }} /> : (
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Text style={{ opacity: 0.2, fontSize: 20 }}>♬</Text></View>
                  )}
                </View>
                <Text numberOfLines={1} style={{ fontSize: 10, color: colors.text, width: "100%", textAlign: "center" }}>{a.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}

      {/* Top Albums */}
      {albumList.length > 0 && (
        <>
          <Text style={{ fontSize: 11, fontWeight: "700", color: colors.textMuted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8, marginTop: 12 }}>
            Top Albums
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            {albumList.map((a: any) => {
              const art = a.albumArt || a.album_art;
              return (
                <TouchableOpacity
                  key={a.id || a.uri}
                  style={{ width: "30%" }}
                  onPress={() => a.uri && navigation.navigate("AlbumDetails", { uri: a.uri })}
                >
                  <View style={{ aspectRatio: 1, borderRadius: 10, overflow: "hidden", backgroundColor: colors.surface2, marginBottom: 4 }}>
                    {art ? <Image source={{ uri: art }} style={{ width: "100%", height: "100%" }} /> : (
                      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Text style={{ opacity: 0.2 }}>💿</Text></View>
                    )}
                  </View>
                  <Text numberOfLines={1} style={{ fontSize: 10, color: colors.text }}>{a.title}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {/* Top Tracks */}
      {trackList.length > 0 && (
        <>
          <Text style={{ fontSize: 11, fontWeight: "700", color: colors.textMuted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8, marginTop: 12 }}>
            Top Tracks
          </Text>
          {trackList.map((t: any, i: number) => {
            const art = t.albumArt || t.album_art;
            return (
              <TouchableOpacity
                key={t.id || t.uri || i}
                style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 12 }}
                onPress={() => t.uri && navigation.navigate("SongDetails", { uri: t.uri })}
              >
                <Text style={{ width: 20, textAlign: "center", fontSize: 11, opacity: 0.4, color: colors.text }}>{i + 1}</Text>
                <View style={{ width: 40, height: 40, borderRadius: 6, overflow: "hidden", backgroundColor: colors.surface2 }}>
                  {art ? <Image source={{ uri: art }} style={{ width: 40, height: 40 }} /> : (
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Text style={{ opacity: 0.2 }}>♪</Text></View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "500", color: colors.text }}>{t.title}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 11, color: colors.textMuted }}>{t.artist || t.albumArtist || t.album_artist}</Text>
                </View>
                <Text style={{ fontSize: 11, color: colors.textMuted }}>{numeral(t.playCount || t.scrobbles).format("0,0")}</Text>
              </TouchableOpacity>
            );
          })}
        </>
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Library tab ──────────────────────────────────────────────────────────────

const LIB_TABS = ["Scrobbles", "Artists", "Albums", "Tracks"];
const PAGE = 30;

function LibraryTab({ did, navigation }: { did: string; navigation: NativeStackNavigationProp<RootStackParamList> }) {
  const [sub, setSub] = useState(0);
  const [scrobblePage, setScrobblePage] = useState(1);
  const [artistPage, setArtistPage] = useState(1);
  const [albumPage, setAlbumPage] = useState(1);
  const [trackPage, setTrackPage] = useState(1);

  const { data: scrobbles } = useRecentTracksByDidQuery(did, (scrobblePage - 1) * PAGE, PAGE);
  const { data: artists } = useArtistsQuery(did, (artistPage - 1) * PAGE, PAGE);
  const { data: albums } = useAlbumsQuery(did, (albumPage - 1) * PAGE, PAGE);
  const { data: tracks } = useTracksQuery(did, (trackPage - 1) * PAGE, PAGE);

  const scrobbleList: any[] = scrobbles || [];
  const artistList: any[] = Array.isArray(artists) ? artists : (artists as any)?.artists ?? [];
  const albumList: any[] = Array.isArray(albums) ? albums : (albums as any)?.albums ?? [];
  const trackList: any[] = Array.isArray(tracks) ? tracks : (tracks as any)?.tracks ?? (tracks as any)?.songs ?? [];

  function Pager({ page, setPage, list }: { page: number; setPage: (n: number) => void; list: any[] }) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 }}>
        <TouchableOpacity
          onPress={() => setPage(Math.max(1, page - 1))}
          disabled={page === 1}
          style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface2, opacity: page === 1 ? 0.3 : 1 }}
        >
          <Text style={{ color: colors.text, fontSize: 13 }}>← Prev</Text>
        </TouchableOpacity>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>Page {page}</Text>
        <TouchableOpacity
          onPress={() => setPage(page + 1)}
          disabled={list.length < PAGE}
          style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface2, opacity: list.length < PAGE ? 0.3 : 1 }}
        >
          <Text style={{ color: colors.text, fontSize: 13 }}>Next →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {/* Sub-tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16, marginTop: 8 }} contentContainerStyle={{ gap: 8 }}>
        {LIB_TABS.map((t, i) => (
          <TouchableOpacity
            key={t}
            onPress={() => setSub(i)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 6,
              borderRadius: 20,
              backgroundColor: sub === i ? colors.primary : colors.surface2,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: sub === i ? "#fff" : colors.textMuted }}>{t}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Scrobbles */}
      {sub === 0 && (
        <>
          {scrobbleList.map((t: any, i: number) => (
            <TouchableOpacity
              key={String(t.id || i)}
              style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 12 }}
              onPress={() => (t.uri || t.song_uri) && navigation.navigate("SongDetails", { uri: t.uri || t.song_uri })}
            >
              <View style={{ width: 40, height: 40, borderRadius: 6, overflow: "hidden", backgroundColor: colors.surface2 }}>
                {imgUrl(t) ? <Image source={{ uri: imgUrl(t) }} style={{ width: 40, height: 40 }} /> : (
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Text style={{ opacity: 0.2 }}>♪</Text></View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "500", color: colors.text }}>{t.title}</Text>
                <Text numberOfLines={1} style={{ fontSize: 11, color: colors.textMuted }}>{t.artist || t.album_artist}</Text>
              </View>
              <Text style={{ fontSize: 10, color: colors.textMuted }}>{dayjs(t.created_at || t.date || t.createdAt).fromNow()}</Text>
            </TouchableOpacity>
          ))}
          {scrobbleList.length === 0 && <Text style={{ color: colors.textMuted, textAlign: "center", paddingVertical: 32, fontSize: 13 }}>No scrobbles yet</Text>}
          <Pager page={scrobblePage} setPage={setScrobblePage} list={scrobbleList} />
        </>
      )}

      {/* Artists */}
      {sub === 1 && (
        <>
          {artistList.map((a: any, i: number) => (
            <TouchableOpacity
              key={a.id || a.uri || i}
              style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 12 }}
              onPress={() => a.uri && navigation.navigate("ArtistDetails", { uri: a.uri })}
            >
              <Text style={{ width: 20, textAlign: "center", fontSize: 11, opacity: 0.4, color: colors.text }}>{(artistPage - 1) * PAGE + i + 1}</Text>
              <View style={{ width: 40, height: 40, borderRadius: 20, overflow: "hidden", backgroundColor: colors.surface2 }}>
                {(a.picture || a.photo) ? <Image source={{ uri: a.picture || a.photo }} style={{ width: 40, height: 40 }} /> : (
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Text style={{ opacity: 0.2 }}>♬</Text></View>
                )}
              </View>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, fontWeight: "500", color: colors.text }}>{a.name}</Text>
              <Text style={{ fontSize: 11, color: colors.textMuted }}>{numeral(a.playCount || a.scrobbles).format("0,0")}</Text>
            </TouchableOpacity>
          ))}
          {artistList.length === 0 && <Text style={{ color: colors.textMuted, textAlign: "center", paddingVertical: 32, fontSize: 13 }}>No artists yet</Text>}
          <Pager page={artistPage} setPage={setArtistPage} list={artistList} />
        </>
      )}

      {/* Albums */}
      {sub === 2 && (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {albumList.map((a: any, i: number) => {
              const art = a.albumArt || a.album_art;
              return (
                <TouchableOpacity
                  key={a.id || a.uri || i}
                  style={{ width: "30%" }}
                  onPress={() => a.uri && navigation.navigate("AlbumDetails", { uri: a.uri })}
                >
                  <View style={{ aspectRatio: 1, borderRadius: 10, overflow: "hidden", backgroundColor: colors.surface2, marginBottom: 4 }}>
                    {art ? <Image source={{ uri: art }} style={{ width: "100%", height: "100%" }} /> : (
                      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Text style={{ opacity: 0.2 }}>💿</Text></View>
                    )}
                  </View>
                  <Text numberOfLines={1} style={{ fontSize: 10, color: colors.text }}>{a.title}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {albumList.length === 0 && <Text style={{ color: colors.textMuted, textAlign: "center", paddingVertical: 32, fontSize: 13 }}>No albums yet</Text>}
          <Pager page={albumPage} setPage={setAlbumPage} list={albumList} />
        </>
      )}

      {/* Tracks */}
      {sub === 3 && (
        <>
          {trackList.map((t: any, i: number) => {
            const art = t.albumArt || t.album_art;
            return (
              <TouchableOpacity
                key={t.id || t.uri || i}
                style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 12 }}
                onPress={() => t.uri && navigation.navigate("SongDetails", { uri: t.uri })}
              >
                <Text style={{ width: 20, textAlign: "center", fontSize: 11, opacity: 0.4, color: colors.text }}>{(trackPage - 1) * PAGE + i + 1}</Text>
                <View style={{ width: 40, height: 40, borderRadius: 6, overflow: "hidden", backgroundColor: colors.surface2 }}>
                  {art ? <Image source={{ uri: art }} style={{ width: 40, height: 40 }} /> : (
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Text style={{ opacity: 0.2 }}>♪</Text></View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "500", color: colors.text }}>{t.title}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 11, color: colors.textMuted }}>{t.artist || t.albumArtist || t.album_artist}</Text>
                </View>
                <Text style={{ fontSize: 11, color: colors.textMuted }}>{numeral(t.playCount || t.scrobbles).format("0,0")}</Text>
              </TouchableOpacity>
            );
          })}
          {trackList.length === 0 && <Text style={{ color: colors.textMuted, textAlign: "center", paddingVertical: 32, fontSize: 13 }}>No tracks yet</Text>}
          <Pager page={trackPage} setPage={setTrackPage} list={trackList} />
        </>
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Followers/Following tabs ─────────────────────────────────────────────────

function UserListTab({ actor, type, navigation }: { actor: string; type: "followers" | "following"; navigation: NativeStackNavigationProp<RootStackParamList> }) {
  const query = type === "followers" ? useFollowersInfiniteQuery(actor, 20) : useFollowsInfiniteQuery(actor, 20);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  const [, setFollows] = useAtom(followsAtom);
  const currentDid = storage.getDid() || "";

  const users: any[] = data?.pages?.flatMap((p: any) => p.followers ?? p.follows ?? []) ?? [];

  const dids = users.map((u) => u.did).filter((d) => d !== currentDid);
  const { data: followsData } = useFollowsQuery(currentDid, dids.length, dids.slice(0, 50));

  useEffect(() => {
    if (!followsData?.follows) return;
    setFollows((prev) => {
      const next = new Set(prev);
      followsData.follows.forEach((f: { did: string }) => next.add(f.did));
      return next;
    });
  }, [followsData]);

  return (
    <FlatList
      data={users}
      keyExtractor={(u) => u.did}
      renderItem={({ item }) => <UserCard user={item} navigation={navigation} />}
      onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
      onEndReachedThreshold={0.3}
      ListEmptyComponent={() => (
        <Text style={{ color: colors.textMuted, textAlign: "center", paddingVertical: 32, fontSize: 13 }}>
          {type === "followers" ? "No followers yet" : "Not following anyone yet"}
        </Text>
      )}
      ListFooterComponent={() =>
        isFetchingNextPage ? (
          <View style={{ padding: 16, alignItems: "center" }}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : null
      }
    />
  );
}

// ─── Circles tab ─────────────────────────────────────────────────────────────

function CirclesTab({ did, handle, navigation }: { did: string; handle: string; navigation: NativeStackNavigationProp<RootStackParamList> }) {
  const { data, isLoading } = useActorNeighboursQuery(did);
  const [follows, setFollows] = useAtom(followsAtom);
  const { mutate: follow } = useFollowAccountMutation();
  const { mutate: unfollow } = useUnfollowAccountMutation();
  const currentDid = storage.getDid() || "";
  const neighbours = data?.neighbours ?? [];

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 40 }}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Text style={{ fontSize: 13, color: colors.textMuted, paddingVertical: 12 }}>
        People on Rocksky with similar music taste to @{handle}
      </Text>
      {neighbours.length === 0 && (
        <Text style={{ color: colors.textMuted, textAlign: "center", paddingVertical: 32, fontSize: 13 }}>No circles found yet</Text>
      )}
      {neighbours.map((n: any) => {
        const isFollowing = follows.has(n.did);
        const isMe = n.did === currentDid;
        const artists: any[] = n.topSharedArtistsDetails || [];
        return (
          <View key={n.did} style={{ flexDirection: "row", alignItems: "flex-start", paddingVertical: 12, gap: 12 }}>
            <TouchableOpacity onPress={() => navigation.navigate("UserProfile", { did: n.did })}>
              <Avatar uri={n.avatar} name={n.displayName || n.handle} size={48} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <TouchableOpacity onPress={() => navigation.navigate("UserProfile", { did: n.did })}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>{n.displayName || n.handle}</Text>
                <Text style={{ fontSize: 12, color: colors.textMuted }}>@{n.handle}</Text>
              </TouchableOpacity>
              {artists.length > 0 && (
                <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                  {currentDid === did ? "You" : "They"} both listen to{" "}
                  {artists.map((a: any, i: number) => a.name).join(", ")}
                </Text>
              )}
            </View>
            {!isMe && currentDid && (
              <TouchableOpacity
                onPress={() => {
                  if (isFollowing) {
                    setFollows((p) => { const s = new Set(p); s.delete(n.did); return s; });
                    unfollow(n.did);
                  } else {
                    setFollows((p) => new Set(p).add(n.did));
                    follow(n.did);
                  }
                }}
                style={{
                  paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
                  backgroundColor: isFollowing ? colors.surface2 : colors.primary,
                  marginTop: 4,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: isFollowing ? colors.text : "#fff" }}>
                  {isFollowing ? "Following" : "Follow"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Loved Tracks tab ─────────────────────────────────────────────────────────

function LovedTracksTab({ did, navigation }: { did: string; navigation: NativeStackNavigationProp<RootStackParamList> }) {
  const [page, setPage] = useState(1);
  const { data: tracks } = useLovedTracksQuery(did, (page - 1) * PAGE, PAGE);
  const list: any[] = tracks || [];

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {list.map((t: any, i: number) => {
        const art = t.albumArt || t.album_art;
        return (
          <TouchableOpacity
            key={String(t.id || i)}
            style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 12 }}
            onPress={() => t.uri && navigation.navigate("SongDetails", { uri: t.uri })}
          >
            <View style={{ width: 40, height: 40, borderRadius: 6, overflow: "hidden", backgroundColor: colors.surface2 }}>
              {art ? <Image source={{ uri: art }} style={{ width: 40, height: 40 }} /> : (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Text style={{ opacity: 0.2 }}>♪</Text></View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "500", color: colors.text }}>{t.title}</Text>
              <Text numberOfLines={1} style={{ fontSize: 11, color: colors.textMuted }}>{t.artist || t.albumArtist || t.album_artist}</Text>
            </View>
            <Text style={{ fontSize: 10, color: colors.textMuted }}>{dayjs(t.createdAt || t.created_at || t.date).fromNow()}</Text>
          </TouchableOpacity>
        );
      })}
      {list.length === 0 && <Text style={{ color: colors.textMuted, textAlign: "center", paddingVertical: 32, fontSize: 13 }}>No loved tracks yet</Text>}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 }}>
        <TouchableOpacity
          onPress={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface2, opacity: page === 1 ? 0.3 : 1 }}
        >
          <Text style={{ color: colors.text, fontSize: 13 }}>← Prev</Text>
        </TouchableOpacity>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>Page {page}</Text>
        <TouchableOpacity
          onPress={() => setPage((p) => p + 1)}
          disabled={list.length < PAGE}
          style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface2, opacity: list.length < PAGE ? 0.3 : 1 }}
        >
          <Text style={{ color: colors.text, fontSize: 13 }}>Next →</Text>
        </TouchableOpacity>
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Main Profile screen ──────────────────────────────────────────────────────

const TABS = ["Overview", "Library", "Followers", "Following", "Circles", "Loved Tracks"];

export default function Profile({ route }: { route?: ProfileRoute }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const currentDid = storage.getDid();
  const profile = useAtomValue(profileAtom);

  const did = (route?.params as any)?.did || profile?.did || currentDid || "";
  const isOwnProfile = !did || did === currentDid || did === profile?.did;

  const { data: profileData, isLoading } = useProfileByDidQuery(did);
  const { data: stats } = useProfileStatsByDidQuery(did);
  const [follows, setFollows] = useAtom(followsAtom);
  const [activeTab, setActiveTab] = useState(0);

  const { mutate: followAccount } = useFollowAccountMutation();
  const { mutate: unfollowAccount } = useUnfollowAccountMutation();

  const resolvedDid = profileData?.did || did;
  const isFollowing = follows.has(resolvedDid);

  const { data: followersCheckData } = useFollowersQuery(
    profileData?.did,
    1,
    currentDid ? [currentDid] : undefined,
  );

  useEffect(() => {
    if (!followersCheckData || !profileData?.did) return;
    setFollows((prev) => {
      const next = new Set(prev);
      if ((followersCheckData.followers || []).some((f: { did: string }) => f.did === currentDid)) {
        next.add(profileData.did);
      } else {
        next.delete(profileData.did);
      }
      return next;
    });
  }, [followersCheckData, profileData?.did, currentDid]);

  const onFollow = () => {
    if (!profileData) return;
    setFollows((prev) => new Set(prev).add(profileData.did));
    followAccount(profileData.did);
  };

  const onUnfollow = () => {
    if (!profileData) return;
    setFollows((prev) => { const n = new Set(prev); n.delete(profileData.did); return n; });
    unfollowAccount(profileData.did);
  };

  const displayProfile = profileData || profile;

  const renderTabContent = () => {
    if (!resolvedDid) return null;
    switch (activeTab) {
      case 0: return <OverviewTab did={resolvedDid} navigation={navigation} />;
      case 1: return <LibraryTab did={resolvedDid} navigation={navigation} />;
      case 2: return <UserListTab actor={resolvedDid} type="followers" navigation={navigation} />;
      case 3: return <UserListTab actor={resolvedDid} type="following" navigation={navigation} />;
      case 4: return <CirclesTab did={resolvedDid} handle={displayProfile?.handle || ""} navigation={navigation} />;
      case 5: return <LovedTracksTab did={resolvedDid} navigation={navigation} />;
    }
    return null;
  };

  const hasScrollContent = activeTab === 2 || activeTab === 3;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 }}>
        {isLoading ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 12 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surface2 }} />
            <View style={{ flex: 1, gap: 8 }}>
              <View style={{ width: 120, height: 16, borderRadius: 4, backgroundColor: colors.surface2 }} />
              <View style={{ width: 80, height: 12, borderRadius: 4, backgroundColor: colors.surface2 }} />
            </View>
          </View>
        ) : (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 12 }}>
              <Avatar uri={displayProfile?.avatar} name={displayProfile?.displayName} size={72} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: "800", color: colors.text }}>{displayProfile?.displayName}</Text>
                <TouchableOpacity onPress={() => Linking.openURL(`https://bsky.app/profile/${displayProfile?.handle}`)}>
                  <Text style={{ fontSize: 13, color: colors.primary }}>@{displayProfile?.handle}</Text>
                </TouchableOpacity>
                <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                  scrobbling since {dayjs(displayProfile?.createdAt).format("MMM YYYY")}
                </Text>
              </View>
            </View>

            {/* Stats */}
            <View style={{ flexDirection: "row", gap: 20, marginBottom: 12 }}>
              {[
                { label: "Scrobbles", value: stats?.scrobbles },
                { label: "Artists", value: stats?.artists },
                { label: "Albums", value: stats?.albums },
                { label: "Loved", value: stats?.lovedTracks },
              ].map(({ label, value }) => (
                <View key={label} style={{ alignItems: "center" }}>
                  <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text }}>{numeral(value).format("0,0") || "—"}</Text>
                  <Text style={{ fontSize: 10, color: colors.textMuted }}>{label}</Text>
                </View>
              ))}
            </View>

            {/* Actions */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              {!isOwnProfile && !isFollowing && (
                <TouchableOpacity
                  onPress={onFollow}
                  style={{ paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.primary }}
                >
                  <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>+ Follow</Text>
                </TouchableOpacity>
              )}
              {!isOwnProfile && isFollowing && (
                <TouchableOpacity
                  onPress={onUnfollow}
                  style={{ paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface2 }}
                >
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>✓ Following</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => {
                  const text = `Check out ${displayProfile?.displayName || displayProfile?.handle} on Rocksky 🎵\nhttps://rocksky.app/profile/${displayProfile?.handle}`;
                  Linking.openURL(`https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`);
                }}
                style={{ paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface2 }}
              >
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "500" }}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => Linking.openURL(`https://pdsls.dev/at/${displayProfile?.did}`)}
                style={{ paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface2 }}
              >
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "500" }}>PDSls ↗</Text>
              </TouchableOpacity>
              {isOwnProfile && (
                <TouchableOpacity
                  onPress={async () => {
                    await storage.clear();
                    Alert.alert("Signed out", "", [{ text: "OK" }]);
                  }}
                  style={{ paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface2 }}
                >
                  <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "500" }}>Sign out</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </View>

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ flexDirection: "row", alignItems: "flex-start" }}
      >
        {TABS.map((tab, i) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(i)}
            style={{
              paddingHorizontal: 14,
              paddingTop: 10,
              paddingBottom: 8,
              borderBottomWidth: 2,
              borderBottomColor: activeTab === i ? colors.primary : "transparent",
              alignSelf: "flex-start",
            }}
          >
            <Text style={{
              fontSize: 13,
              fontWeight: "600",
              color: activeTab === i ? colors.primary : colors.textMuted,
            }}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tab content */}
      <View style={{ flex: 1, paddingHorizontal: hasScrollContent ? 0 : 16 }}>
        {renderTabContent()}
      </View>
    </SafeAreaView>
  );
}
