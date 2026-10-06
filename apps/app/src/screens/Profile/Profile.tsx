import TrackLikeButton from "@/src/components/TrackLikeButton";
import Feather from "@expo/vector-icons/Feather";
import { type RouteProp, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Image } from "expo-image";
import { useAtom, useAtomValue } from "jotai";
import numeral from "numeral";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { GraphUser } from "@/src/api/graph";
import { authTokenAtom } from "@/src/atoms/auth";
import { followsAtom } from "@/src/atoms/follows";
import { profileAtom } from "@/src/atoms/profile";
import FloatingShoutBar from "@/src/components/FloatingShoutBar";
import ProfileDrawer from "@/src/components/ProfileDrawer";
import { Text } from "@/src/components/Text";
import UserAvatar from "@/src/components/UserAvatar";
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
import type { RootStackParamList } from "@/src/Navigation";
import { storage } from "@/src/storage";
import { colors } from "@/src/theme";
import type { Track } from "@/src/types/track";

dayjs.extend(relativeTime);

type ProfileRoute = RouteProp<RootStackParamList, "Profile" | "UserProfile">;

type TrackItem = {
  trackUri?: string;
  trackId?: string;
  liked?: boolean;
  id?: string;
  uri?: string;
  song_uri?: string;
  title?: string;
  artist?: string;
  albumArtist?: string;
  album_artist?: string;
  albumArt?: string;
  album_art?: string;
  cover?: string;
  playCount?: number;
  scrobbles?: number;
  createdAt?: string;
  created_at?: string;
  date?: string;
};

type ArtistItem = {
  id?: string;
  uri?: string;
  name?: string;
  picture?: string;
  photo?: string;
  playCount?: number;
  scrobbles?: number;
};

type AlbumItem = {
  id?: string;
  uri?: string;
  title?: string;
  albumArt?: string;
  album_art?: string;
};

function imgUrl(track: TrackItem): string {
  return track.cover || track.album_art || track.albumArt || "";
}

// Registered by the active tab so the outer ScrollView can drive infinite
// scroll and pull-to-refresh without owning the tabs' queries.
type LoadMoreRef = { current: (() => void) | null };
type RefreshRef = { current: (() => Promise<unknown>) | null };

// ─── Avatar ──────────────────────────────────────────────────────────────────

function Avatar({ uri, size = 48 }: { uri?: string; size?: number }) {
  return <UserAvatar uri={uri} size={size} />;
}

// ─── User card ───────────────────────────────────────────────────────────────

function UserCard({
  user,
  navigation,
}: {
  user: GraphUser;
  navigation: NativeStackNavigationProp<RootStackParamList>;
}) {
  const currentDid = storage.getDid();
  const [follows, setFollows] = useAtom(followsAtom);
  const { mutate: follow } = useFollowAccountMutation();
  const { mutate: unfollow } = useUnfollowAccountMutation();
  const isFollowing = follows.has(user.did);
  const isMe = user.did === currentDid;

  return (
    <TouchableOpacity
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 16,
        gap: 12,
      }}
      onPress={() => navigation.navigate("UserProfile", { did: user.did })}
    >
      <Avatar uri={user.avatar} size={48} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>
          {user.displayName || user.handle}
        </Text>
        <Text style={{ fontSize: 12, color: colors.primary }}>
          @{user.handle}
        </Text>
      </View>
      {!isMe && currentDid && (
        <TouchableOpacity
          onPress={() => {
            if (isFollowing) {
              setFollows((p) => {
                const n = new Set(p);
                n.delete(user.did);
                return n;
              });
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
          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
              color: isFollowing ? colors.text : "#fff",
            }}
          >
            {isFollowing ? "Following" : "Follow"}
          </Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// ─── Top track badge ─────────────────────────────────────────────────────────

function TopTrackBadge({
  track,
  navigation,
}: {
  track: Track;
  navigation: NativeStackNavigationProp<RootStackParamList>;
}) {
  return (
    <TouchableOpacity
      disabled={!track.uri}
      onPress={() =>
        track.uri && navigation.navigate("SongDetails", { uri: track.uri })
      }
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: colors.surface,
        borderRadius: 10,
        padding: 10,
        marginTop: 10,
      }}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 8,
          overflow: "hidden",
          backgroundColor: colors.surface2,
        }}
      >
        {track.albumArt ? (
          <Image
            source={{ uri: track.albumArt }}
            style={{ width: 48, height: 48 }}
          />
        ) : (
          <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ opacity: 0.2 }}>♪</Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{ fontSize: 10, letterSpacing: 1, color: colors.textMuted }}
        >
          TOP TRACK
        </Text>
        <Text
          numberOfLines={1}
          style={{ fontSize: 14, fontWeight: "600", color: colors.text }}
        >
          {track.title}
        </Text>
        <Text
          numberOfLines={1}
          style={{ fontSize: 12, color: colors.textMuted }}
        >
          {track.artist}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Time-range switcher ──────────────────────────────────────────────────────

const RANGE_OPTIONS: { label: string; days: number | null }[] = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "180 days", days: 180 },
  { label: "365 days", days: 365 },
  { label: "All time", days: null },
];

function RangePills({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (days: number | null) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginTop: 20, flexGrow: 0 }}
      contentContainerStyle={{ gap: 8 }}
    >
      {RANGE_OPTIONS.map((option) => {
        const active = option.days === value;
        return (
          <TouchableOpacity
            key={option.label}
            onPress={() => onChange(option.days)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 6,
              borderRadius: 20,
              backgroundColor: active ? colors.surface3 : "transparent",
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: active ? colors.text : colors.textMuted,
              }}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  did,
  navigation,
  refreshRef,
}: {
  did: string;
  navigation: NativeStackNavigationProp<RootStackParamList>;
  refreshRef: RefreshRef;
}) {
  const { data: owner } = useProfileByDidQuery(did);
  const [rangeDays, setRangeDays] = useState<number | null>(7);
  const [autoSwitched, setAutoSwitched] = useState(false);

  const startDate =
    rangeDays === null
      ? undefined
      : dayjs().subtract(rangeDays, "day").startOf("day").toDate();
  const endDate =
    rangeDays === null ? undefined : dayjs().endOf("day").toDate();

  const { data: recentTracks, refetch: refetchRecent } =
    useRecentTracksByDidQuery(did, 0, 20);
  const artistsQuery = useArtistsQuery(did, 0, 5, startDate, endDate);
  const albumsQuery = useAlbumsQuery(did, 0, 6, startDate, endDate);
  const tracksQuery = useTracksQuery(did, 0, 10, startDate, endDate);

  const recentList: TrackItem[] = recentTracks || [];
  const artistList: ArtistItem[] = artistsQuery.data?.artists ?? [];
  const albumList: AlbumItem[] = albumsQuery.data?.albums ?? [];
  const trackList: TrackItem[] = tracksQuery.data?.tracks ?? [];

  // Auto-switch to All time once when the default 7-day window has no data.
  const chartsSettled =
    artistsQuery.isSuccess && albumsQuery.isSuccess && tracksQuery.isSuccess;
  const chartsEmpty =
    artistList.length === 0 && albumList.length === 0 && trackList.length === 0;
  const probeEnabled =
    !autoSwitched && rangeDays === 7 && chartsSettled && chartsEmpty;
  const probeQuery = useTracksQuery(probeEnabled ? did : "", 0, 1);

  useEffect(() => {
    if (!probeEnabled || !probeQuery.isSuccess) return;
    setAutoSwitched(true);
    if ((probeQuery.data?.tracks ?? []).length > 0) {
      setRangeDays(null);
    }
  }, [probeEnabled, probeQuery.isSuccess, probeQuery.data]);

  const onRangeChange = (days: number | null) => {
    setAutoSwitched(true);
    setRangeDays(days);
  };

  const period =
    RANGE_OPTIONS.find((option) => option.days === rangeDays)?.label ||
    "All time";
  const chartHeading = (title: string, names: string[], pending: boolean) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 16,
        marginBottom: 8,
      }}
    >
      <Text
        style={{
          color: colors.textMuted,
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        {title}
      </Text>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`Share ${title.toLowerCase()} for ${period}`}
        disabled={pending || names.length === 0}
        onPress={() =>
          navigation.navigate("ShareCard", {
            item: {
              kind: "chart",
              uri: did,
              title,
              subtitle: `${owner?.displayName || owner?.handle || did} · ${period}`,
              rankings: [{ label: period, names: names.slice(0, 5) }],
            },
          })
        }
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 16,
          backgroundColor: colors.surface2,
          opacity: pending ? 0.4 : 1,
        }}
      >
        <Feather name="share-2" size={14} color={colors.primary} />
        <Text style={{ color: colors.primary, fontSize: 12 }}>Share top 5</Text>
      </TouchableOpacity>
    </View>
  );

  const refetchArtists = artistsQuery.refetch;
  const refetchAlbums = albumsQuery.refetch;
  const refetchTracks = tracksQuery.refetch;
  useEffect(() => {
    refreshRef.current = () =>
      Promise.all([
        refetchRecent(),
        refetchArtists(),
        refetchAlbums(),
        refetchTracks(),
      ]);
    return () => {
      refreshRef.current = null;
    };
  }, [refreshRef, refetchRecent, refetchArtists, refetchAlbums, refetchTracks]);

  return (
    <View>
      <TouchableOpacity
        accessibilityRole="button"
        onPress={() =>
          navigation.navigate("Wrapped", {
            did,
            name: owner?.displayName || owner?.handle,
          })
        }
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          padding: 16,
          marginTop: 16,
          borderRadius: 16,
          backgroundColor: colors.surface2,
        }}
      >
        <Feather name="gift" size={24} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: "700" }}>
            Create a Wrapped card
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
            Choose a year, preview it, then share.
          </Text>
        </View>
        <Feather name="chevron-right" size={20} color={colors.textMuted} />
      </TouchableOpacity>
      {/* Recent Listens */}
      <Text
        style={{
          fontSize: 11,
          fontWeight: "700",
          color: colors.textMuted,
          letterSpacing: 1,
          textTransform: "uppercase",
          marginBottom: 8,
          marginTop: 16,
        }}
      >
        Recent Listens
      </Text>
      {recentList.map((track, i) => {
        const cover = imgUrl(track);
        const uri = track.uri || track.song_uri;
        return (
          <TouchableOpacity
            key={String(track.id || i)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 10,
              gap: 12,
            }}
            onPress={() => uri && navigation.navigate("SongDetails", { uri })}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 6,
                overflow: "hidden",
                backgroundColor: colors.surface2,
              }}
            >
              {cover ? (
                <Image
                  source={{ uri: cover }}
                  style={{ width: 40, height: 40 }}
                />
              ) : (
                <View
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ opacity: 0.2 }}>♪</Text>
                </View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text
                numberOfLines={1}
                style={{ fontSize: 13, fontWeight: "500", color: colors.text }}
              >
                {track.title}
              </Text>
              <Text
                numberOfLines={1}
                style={{ fontSize: 11, color: colors.textMuted }}
              >
                {track.artist || track.album_artist}
              </Text>
            </View>
            <Text style={{ fontSize: 10, color: colors.textMuted }}>
              {dayjs(
                track.created_at || track.date || track.createdAt,
              ).fromNow()}
            </Text>
            <TrackLikeButton track={track} />
          </TouchableOpacity>
        );
      })}

      {/* Time range for the top charts */}
      <RangePills value={rangeDays} onChange={onRangeChange} />

      {/* Top Artists */}
      {artistList.length > 0 && (
        <>
          {chartHeading(
            "Top Artists",
            artistList.map((a) => a.name || "Unknown artist"),
            artistsQuery.isFetching || artistsQuery.isPlaceholderData,
          )}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 8 }}
          >
            {artistList.map((a) => (
              <TouchableOpacity
                key={a.id || a.uri}
                style={{ alignItems: "center", marginRight: 16, width: 68 }}
                onPress={() =>
                  a.uri && navigation.navigate("ArtistDetails", { uri: a.uri })
                }
              >
                <View
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: 30,
                    overflow: "hidden",
                    backgroundColor: colors.surface2,
                    marginBottom: 4,
                  }}
                >
                  {a.picture || a.photo ? (
                    <Image
                      source={{ uri: a.picture || a.photo }}
                      style={{ width: 60, height: 60 }}
                    />
                  ) : (
                    <View
                      style={{
                        flex: 1,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ opacity: 0.2, fontSize: 20 }}>♬</Text>
                    </View>
                  )}
                </View>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 10,
                    color: colors.text,
                    width: "100%",
                    textAlign: "center",
                  }}
                >
                  {a.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}

      {/* Top Albums */}
      {albumList.length > 0 && (
        <>
          {chartHeading(
            "Top Albums",
            albumList.map((a) => a.title || "Untitled album"),
            albumsQuery.isFetching || albumsQuery.isPlaceholderData,
          )}
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 8,
            }}
          >
            {albumList.map((a) => {
              const art = a.albumArt || a.album_art;
              return (
                <TouchableOpacity
                  key={a.id || a.uri}
                  style={{ width: "30%" }}
                  onPress={() =>
                    a.uri && navigation.navigate("AlbumDetails", { uri: a.uri })
                  }
                >
                  <View
                    style={{
                      aspectRatio: 1,
                      borderRadius: 10,
                      overflow: "hidden",
                      backgroundColor: colors.surface2,
                      marginBottom: 4,
                    }}
                  >
                    {art ? (
                      <Image
                        source={{ uri: art }}
                        style={{ width: "100%", height: "100%" }}
                      />
                    ) : (
                      <View
                        style={{
                          flex: 1,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ opacity: 0.2 }}>💿</Text>
                      </View>
                    )}
                  </View>
                  <Text
                    numberOfLines={1}
                    style={{ fontSize: 10, color: colors.text }}
                  >
                    {a.title}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {/* Top Tracks */}
      {trackList.length > 0 && (
        <>
          {chartHeading(
            "Top Tracks",
            trackList.map(
              (t) =>
                `${t.title || "Untitled track"} · ${t.artist || t.albumArtist || t.album_artist || "Unknown artist"}`,
            ),
            tracksQuery.isFetching || tracksQuery.isPlaceholderData,
          )}
          {trackList.map((t, i) => {
            const art = t.albumArt || t.album_art;
            return (
              <TouchableOpacity
                key={t.id || t.uri || i}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 10,
                  gap: 12,
                }}
                onPress={() =>
                  t.uri && navigation.navigate("SongDetails", { uri: t.uri })
                }
              >
                <Text
                  style={{
                    width: 20,
                    textAlign: "center",
                    fontSize: 11,
                    opacity: 0.4,
                    color: colors.text,
                  }}
                >
                  {i + 1}
                </Text>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 6,
                    overflow: "hidden",
                    backgroundColor: colors.surface2,
                  }}
                >
                  {art ? (
                    <Image
                      source={{ uri: art }}
                      style={{ width: 40, height: 40 }}
                    />
                  ) : (
                    <View
                      style={{
                        flex: 1,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ opacity: 0.2 }}>♪</Text>
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 13,
                      fontWeight: "500",
                      color: colors.text,
                    }}
                  >
                    {t.title}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{ fontSize: 11, color: colors.textMuted }}
                  >
                    {t.artist || t.albumArtist || t.album_artist}
                  </Text>
                </View>
                <Text style={{ fontSize: 11, color: colors.textMuted }}>
                  {numeral(t.playCount || t.scrobbles).format("0,0")}
                </Text>
              </TouchableOpacity>
            );
          })}
        </>
      )}
      <View style={{ height: 40 }} />
    </View>
  );
}

// ─── Library tab ──────────────────────────────────────────────────────────────

const LIB_TABS = ["Scrobbles", "Artists", "Albums", "Tracks"];
const PAGE = 30;

function Pager({
  page,
  setPage,
  list,
}: {
  page: number;
  setPage: (n: number) => void;
  list: unknown[];
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 12,
      }}
    >
      <TouchableOpacity
        onPress={() => setPage(Math.max(1, page - 1))}
        disabled={page === 1}
        style={{
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderRadius: 20,
          backgroundColor: colors.surface2,
          opacity: page === 1 ? 0.3 : 1,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 13 }}>← Prev</Text>
      </TouchableOpacity>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>Page {page}</Text>
      <TouchableOpacity
        onPress={() => setPage(page + 1)}
        disabled={list.length < PAGE}
        style={{
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderRadius: 20,
          backgroundColor: colors.surface2,
          opacity: list.length < PAGE ? 0.3 : 1,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 13 }}>Next →</Text>
      </TouchableOpacity>
    </View>
  );
}

function LibraryTab({
  did,
  navigation,
  refreshRef,
}: {
  did: string;
  navigation: NativeStackNavigationProp<RootStackParamList>;
  refreshRef: RefreshRef;
}) {
  const [sub, setSub] = useState(0);
  const [scrobblePage, setScrobblePage] = useState(1);
  const [artistPage, setArtistPage] = useState(1);
  const [albumPage, setAlbumPage] = useState(1);
  const [trackPage, setTrackPage] = useState(1);

  const { data: scrobbles, refetch: refetchScrobbles } =
    useRecentTracksByDidQuery(did, (scrobblePage - 1) * PAGE, PAGE);
  const { data: artists, refetch: refetchArtists } = useArtistsQuery(
    did,
    (artistPage - 1) * PAGE,
    PAGE,
  );
  const { data: albums, refetch: refetchAlbums } = useAlbumsQuery(
    did,
    (albumPage - 1) * PAGE,
    PAGE,
  );
  const { data: tracks, refetch: refetchTracks } = useTracksQuery(
    did,
    (trackPage - 1) * PAGE,
    PAGE,
  );

  const scrobbleList: TrackItem[] = scrobbles || [];
  const artistList: ArtistItem[] = artists?.artists ?? [];
  const albumList: AlbumItem[] = albums?.albums ?? [];
  const trackList: TrackItem[] = tracks?.tracks ?? [];

  useEffect(() => {
    refreshRef.current = () =>
      Promise.all([
        refetchScrobbles(),
        refetchArtists(),
        refetchAlbums(),
        refetchTracks(),
      ]);
    return () => {
      refreshRef.current = null;
    };
  }, [
    refreshRef,
    refetchScrobbles,
    refetchArtists,
    refetchAlbums,
    refetchTracks,
  ]);

  return (
    <View>
      {/* Sub-tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 16, marginTop: 8 }}
        contentContainerStyle={{ gap: 8 }}
      >
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
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: sub === i ? "#fff" : colors.textMuted,
              }}
            >
              {t}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Scrobbles */}
      {sub === 0 && (
        <>
          {scrobbleList.map((t, i) => (
            <TouchableOpacity
              key={String(t.id || i)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 10,
                gap: 12,
              }}
              onPress={() => {
                const uri = t.uri || t.song_uri;
                if (uri) navigation.navigate("SongDetails", { uri });
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 6,
                  overflow: "hidden",
                  backgroundColor: colors.surface2,
                }}
              >
                {imgUrl(t) ? (
                  <Image
                    source={{ uri: imgUrl(t) }}
                    style={{ width: 40, height: 40 }}
                  />
                ) : (
                  <View
                    style={{
                      flex: 1,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ opacity: 0.2 }}>♪</Text>
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 13,
                    fontWeight: "500",
                    color: colors.text,
                  }}
                >
                  {t.title}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{ fontSize: 11, color: colors.textMuted }}
                >
                  {t.artist || t.album_artist}
                </Text>
              </View>
              <Text style={{ fontSize: 10, color: colors.textMuted }}>
                {dayjs(t.created_at || t.date || t.createdAt).fromNow()}
              </Text>
              <TrackLikeButton track={t} />
            </TouchableOpacity>
          ))}
          {scrobbleList.length === 0 && (
            <Text
              style={{
                color: colors.textMuted,
                textAlign: "center",
                paddingVertical: 32,
                fontSize: 13,
              }}
            >
              No scrobbles yet
            </Text>
          )}
          <Pager
            page={scrobblePage}
            setPage={setScrobblePage}
            list={scrobbleList}
          />
        </>
      )}

      {/* Artists */}
      {sub === 1 && (
        <>
          {artistList.map((a, i) => (
            <TouchableOpacity
              key={a.id || a.uri || i}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 10,
                gap: 12,
              }}
              onPress={() =>
                a.uri && navigation.navigate("ArtistDetails", { uri: a.uri })
              }
            >
              <Text
                style={{
                  width: 20,
                  textAlign: "center",
                  fontSize: 11,
                  opacity: 0.4,
                  color: colors.text,
                }}
              >
                {(artistPage - 1) * PAGE + i + 1}
              </Text>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  overflow: "hidden",
                  backgroundColor: colors.surface2,
                }}
              >
                {a.picture || a.photo ? (
                  <Image
                    source={{ uri: a.picture || a.photo }}
                    style={{ width: 40, height: 40 }}
                  />
                ) : (
                  <View
                    style={{
                      flex: 1,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ opacity: 0.2 }}>♬</Text>
                  </View>
                )}
              </View>
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  fontSize: 13,
                  fontWeight: "500",
                  color: colors.text,
                }}
              >
                {a.name}
              </Text>
              <Text style={{ fontSize: 11, color: colors.textMuted }}>
                {numeral(a.playCount || a.scrobbles).format("0,0")}
              </Text>
            </TouchableOpacity>
          ))}
          {artistList.length === 0 && (
            <Text
              style={{
                color: colors.textMuted,
                textAlign: "center",
                paddingVertical: 32,
                fontSize: 13,
              }}
            >
              No artists yet
            </Text>
          )}
          <Pager page={artistPage} setPage={setArtistPage} list={artistList} />
        </>
      )}

      {/* Albums */}
      {sub === 2 && (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {albumList.map((a, i) => {
              const art = a.albumArt || a.album_art;
              return (
                <TouchableOpacity
                  key={a.id || a.uri || i}
                  style={{ width: "30%" }}
                  onPress={() =>
                    a.uri && navigation.navigate("AlbumDetails", { uri: a.uri })
                  }
                >
                  <View
                    style={{
                      aspectRatio: 1,
                      borderRadius: 10,
                      overflow: "hidden",
                      backgroundColor: colors.surface2,
                      marginBottom: 4,
                    }}
                  >
                    {art ? (
                      <Image
                        source={{ uri: art }}
                        style={{ width: "100%", height: "100%" }}
                      />
                    ) : (
                      <View
                        style={{
                          flex: 1,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ opacity: 0.2 }}>💿</Text>
                      </View>
                    )}
                  </View>
                  <Text
                    numberOfLines={1}
                    style={{ fontSize: 10, color: colors.text }}
                  >
                    {a.title}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {albumList.length === 0 && (
            <Text
              style={{
                color: colors.textMuted,
                textAlign: "center",
                paddingVertical: 32,
                fontSize: 13,
              }}
            >
              No albums yet
            </Text>
          )}
          <Pager page={albumPage} setPage={setAlbumPage} list={albumList} />
        </>
      )}

      {/* Tracks */}
      {sub === 3 && (
        <>
          {trackList.map((t, i) => {
            const art = t.albumArt || t.album_art;
            return (
              <TouchableOpacity
                key={t.id || t.uri || i}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 10,
                  gap: 12,
                }}
                onPress={() =>
                  t.uri && navigation.navigate("SongDetails", { uri: t.uri })
                }
              >
                <Text
                  style={{
                    width: 20,
                    textAlign: "center",
                    fontSize: 11,
                    opacity: 0.4,
                    color: colors.text,
                  }}
                >
                  {(trackPage - 1) * PAGE + i + 1}
                </Text>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 6,
                    overflow: "hidden",
                    backgroundColor: colors.surface2,
                  }}
                >
                  {art ? (
                    <Image
                      source={{ uri: art }}
                      style={{ width: 40, height: 40 }}
                    />
                  ) : (
                    <View
                      style={{
                        flex: 1,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ opacity: 0.2 }}>♪</Text>
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 13,
                      fontWeight: "500",
                      color: colors.text,
                    }}
                  >
                    {t.title}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{ fontSize: 11, color: colors.textMuted }}
                  >
                    {t.artist || t.albumArtist || t.album_artist}
                  </Text>
                </View>
                <Text style={{ fontSize: 11, color: colors.textMuted }}>
                  {numeral(t.playCount || t.scrobbles).format("0,0")}
                </Text>
              </TouchableOpacity>
            );
          })}
          {trackList.length === 0 && (
            <Text
              style={{
                color: colors.textMuted,
                textAlign: "center",
                paddingVertical: 32,
                fontSize: 13,
              }}
            >
              No tracks yet
            </Text>
          )}
          <Pager page={trackPage} setPage={setTrackPage} list={trackList} />
        </>
      )}
      <View style={{ height: 40 }} />
    </View>
  );
}

// ─── Followers/Following tabs ─────────────────────────────────────────────────

function UserListTab({
  actor,
  type,
  navigation,
  loadMoreRef,
  refreshRef,
}: {
  actor: string;
  type: "followers" | "following";
  navigation: NativeStackNavigationProp<RootStackParamList>;
  loadMoreRef: LoadMoreRef;
  refreshRef: RefreshRef;
}) {
  const isFollowers = type === "followers";
  // Both hooks run unconditionally (rules of hooks); the inactive one is
  // disabled by its empty actor via the hooks' `enabled: !!actor` flag.
  const followersQuery = useFollowersInfiniteQuery(
    isFollowers ? actor : "",
    20,
  );
  const followsQuery = useFollowsInfiniteQuery(isFollowers ? "" : actor, 20);
  const { fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    isFollowers ? followersQuery : followsQuery;
  const [, setFollows] = useAtom(followsAtom);
  const currentDid = storage.getDid() || "";

  const users: GraphUser[] = isFollowers
    ? (followersQuery.data?.pages.flatMap((p) => p.followers ?? []) ?? [])
    : (followsQuery.data?.pages.flatMap((p) => p.follows ?? []) ?? []);

  const dids = users.map((u) => u.did).filter((d) => d !== currentDid);
  const { data: followsData } = useFollowsQuery(
    currentDid,
    dids.length,
    dids.slice(0, 50),
  );

  useEffect(() => {
    if (!followsData?.follows) return;
    setFollows((prev) => {
      const next = new Set(prev);
      followsData.follows.forEach((f) => {
        next.add(f.did);
      });
      return next;
    });
  }, [followsData, setFollows]);

  useEffect(() => {
    loadMoreRef.current =
      hasNextPage && !isFetchingNextPage ? () => fetchNextPage() : null;
    return () => {
      loadMoreRef.current = null;
    };
  }, [loadMoreRef, hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    refreshRef.current = () => refetch();
    return () => {
      refreshRef.current = null;
    };
  }, [refreshRef, refetch]);

  return (
    <View>
      {users.map((user) => (
        <UserCard key={user.did} user={user} navigation={navigation} />
      ))}
      {users.length === 0 && (
        <Text
          style={{
            color: colors.textMuted,
            textAlign: "center",
            paddingVertical: 32,
            fontSize: 13,
          }}
        >
          {type === "followers"
            ? "No followers yet"
            : "Not following anyone yet"}
        </Text>
      )}
      {isFetchingNextPage && (
        <View style={{ padding: 16, alignItems: "center" }}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      )}
    </View>
  );
}

// ─── Circles tab ─────────────────────────────────────────────────────────────

function CirclesTab({
  did,
  handle,
  navigation,
  refreshRef,
}: {
  did: string;
  handle: string;
  navigation: NativeStackNavigationProp<RootStackParamList>;
  refreshRef: RefreshRef;
}) {
  const { data, isLoading, refetch } = useActorNeighboursQuery(did);
  const [follows, setFollows] = useAtom(followsAtom);
  const { mutate: follow } = useFollowAccountMutation();
  const { mutate: unfollow } = useUnfollowAccountMutation();
  const currentDid = storage.getDid() || "";
  const neighbours = data?.neighbours ?? [];

  useEffect(() => {
    refreshRef.current = () => refetch();
    return () => {
      refreshRef.current = null;
    };
  }, [refreshRef, refetch]);

  if (isLoading) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 40 }}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  return (
    <View>
      <Text
        style={{ fontSize: 13, color: colors.textMuted, paddingVertical: 12 }}
      >
        People on Rocksky with similar music taste to @{handle}
      </Text>
      {neighbours.length === 0 && (
        <Text
          style={{
            color: colors.textMuted,
            textAlign: "center",
            paddingVertical: 32,
            fontSize: 13,
          }}
        >
          No circles found yet
        </Text>
      )}
      {neighbours.map((n) => {
        const isFollowing = follows.has(n.did);
        const isMe = n.did === currentDid;
        const artists = n.topSharedArtistsDetails || [];
        return (
          <View
            key={n.did}
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              paddingVertical: 12,
              gap: 12,
            }}
          >
            <TouchableOpacity
              onPress={() => navigation.navigate("UserProfile", { did: n.did })}
            >
              <Avatar uri={n.avatar} size={48} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate("UserProfile", { did: n.did })
                }
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: colors.text,
                  }}
                >
                  {n.displayName || n.handle}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textMuted }}>
                  @{n.handle}
                </Text>
              </TouchableOpacity>
              {artists.length > 0 && (
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.textMuted,
                    marginTop: 2,
                  }}
                >
                  {currentDid === did ? "You" : "They"} both listen to{" "}
                  {artists.map((a) => a.name).join(", ")}
                </Text>
              )}
            </View>
            {!isMe && currentDid && (
              <TouchableOpacity
                onPress={() => {
                  if (isFollowing) {
                    setFollows((p) => {
                      const s = new Set(p);
                      s.delete(n.did);
                      return s;
                    });
                    unfollow(n.did);
                  } else {
                    setFollows((p) => new Set(p).add(n.did));
                    follow(n.did);
                  }
                }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 6,
                  borderRadius: 20,
                  backgroundColor: isFollowing
                    ? colors.surface2
                    : colors.primary,
                  marginTop: 4,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: isFollowing ? colors.text : "#fff",
                  }}
                >
                  {isFollowing ? "Following" : "Follow"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
      <View style={{ height: 40 }} />
    </View>
  );
}

// ─── Loved Tracks tab ─────────────────────────────────────────────────────────

function LovedTracksTab({
  did,
  navigation,
  refreshRef,
}: {
  did: string;
  navigation: NativeStackNavigationProp<RootStackParamList>;
  refreshRef: RefreshRef;
}) {
  const [page, setPage] = useState(1);
  const { data: tracks, refetch } = useLovedTracksQuery(
    did,
    (page - 1) * PAGE,
    PAGE,
  );
  const list: TrackItem[] = tracks || [];

  useEffect(() => {
    refreshRef.current = () => refetch();
    return () => {
      refreshRef.current = null;
    };
  }, [refreshRef, refetch]);

  return (
    <View>
      {list.map((t, i) => {
        const art = t.albumArt || t.album_art;
        return (
          <TouchableOpacity
            key={String(t.id || i)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 10,
              gap: 12,
            }}
            onPress={() =>
              t.uri && navigation.navigate("SongDetails", { uri: t.uri })
            }
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 6,
                overflow: "hidden",
                backgroundColor: colors.surface2,
              }}
            >
              {art ? (
                <Image
                  source={{ uri: art }}
                  style={{ width: 40, height: 40 }}
                />
              ) : (
                <View
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ opacity: 0.2 }}>♪</Text>
                </View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text
                numberOfLines={1}
                style={{ fontSize: 13, fontWeight: "500", color: colors.text }}
              >
                {t.title}
              </Text>
              <Text
                numberOfLines={1}
                style={{ fontSize: 11, color: colors.textMuted }}
              >
                {t.artist || t.albumArtist || t.album_artist}
              </Text>
            </View>
            <Text style={{ fontSize: 10, color: colors.textMuted }}>
              {dayjs(t.createdAt || t.created_at || t.date).fromNow()}
            </Text>
          </TouchableOpacity>
        );
      })}
      {list.length === 0 && (
        <Text
          style={{
            color: colors.textMuted,
            textAlign: "center",
            paddingVertical: 32,
            fontSize: 13,
          }}
        >
          No loved tracks yet
        </Text>
      )}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 12,
        }}
      >
        <TouchableOpacity
          onPress={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 20,
            backgroundColor: colors.surface2,
            opacity: page === 1 ? 0.3 : 1,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 13 }}>← Prev</Text>
        </TouchableOpacity>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          Page {page}
        </Text>
        <TouchableOpacity
          onPress={() => setPage((p) => p + 1)}
          disabled={list.length < PAGE}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 20,
            backgroundColor: colors.surface2,
            opacity: list.length < PAGE ? 0.3 : 1,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 13 }}>Next →</Text>
        </TouchableOpacity>
      </View>
      <View style={{ height: 40 }} />
    </View>
  );
}

// ─── Main Profile screen ──────────────────────────────────────────────────────

const TABS = [
  "Overview",
  "Library",
  "Followers",
  "Following",
  "Circles",
  "Loved Tracks",
];

// Roughly where the 72px header avatar scrolls out of view.
const PIN_THRESHOLD = 140;

export default function Profile({ route }: { route?: ProfileRoute }) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const currentDid = storage.getDid();
  const profile = useAtomValue(profileAtom);
  const token = useAtomValue(authTokenAtom);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const params = route?.params as { did?: string; handle?: string } | undefined;
  const did = params?.did || params?.handle || profile?.did || currentDid || "";
  const isOwnProfile =
    !did ||
    did === currentDid ||
    did === profile?.did ||
    did === profile?.handle;

  const {
    data: profileData,
    isLoading,
    refetch: refetchProfile,
  } = useProfileByDidQuery(did);
  const { data: stats, refetch: refetchStats } = useProfileStatsByDidQuery(did);
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
      if (
        (followersCheckData.followers || []).some((f) => f.did === currentDid)
      ) {
        next.add(profileData.did);
      } else {
        next.delete(profileData.did);
      }
      return next;
    });
  }, [followersCheckData, profileData?.did, currentDid, setFollows]);

  // Genres + top track over the last 7 days, falling back to all time when
  // the window is empty (inactive queries are disabled via an empty did).
  const headerStart = dayjs().subtract(7, "day").startOf("day").toDate();
  const headerEnd = dayjs().endOf("day").toDate();

  const genreArtistsQuery = useArtistsQuery(
    resolvedDid,
    0,
    100,
    headerStart,
    headerEnd,
  );
  const genreArtists7d = genreArtistsQuery.data?.artists ?? [];
  const genreArtistsAllQuery = useArtistsQuery(
    genreArtistsQuery.isSuccess && genreArtists7d.length === 0
      ? resolvedDid
      : "",
    0,
    100,
  );
  const genreArtists =
    genreArtists7d.length > 0
      ? genreArtists7d
      : (genreArtistsAllQuery.data?.artists ?? []);
  const genreTags: string[] = [];
  for (const artist of genreArtists) {
    for (const tag of artist.tags ?? []) {
      const label = tag.trim().replace(/\s+/g, " ");
      if (
        label &&
        !genreTags.some(
          (existing) => existing.toLowerCase() === label.toLowerCase(),
        )
      )
        genreTags.push(label);
      if (genreTags.length >= 20) break;
    }
    if (genreTags.length >= 20) break;
  }

  const topTrackQuery = useTracksQuery(
    resolvedDid,
    0,
    1,
    headerStart,
    headerEnd,
  );
  const topTracks7d = topTrackQuery.data?.tracks ?? [];
  const topTrackAllQuery = useTracksQuery(
    topTrackQuery.isSuccess && topTracks7d.length === 0 ? resolvedDid : "",
    0,
    1,
  );
  const topTrack = topTracks7d[0] ?? topTrackAllQuery.data?.tracks?.[0];

  // Whole-screen scrolling: the active tab registers its pagination/refresh
  // hooks here so the single outer ScrollView can drive them.
  const scrollRef = useRef<ScrollView>(null);
  const loadMoreRef = useRef<(() => void) | null>(null);
  const refreshRef = useRef<(() => Promise<unknown>) | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pinned, setPinned] = useState(false);
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    setPinned(contentOffset.y > PIN_THRESHOLD);
    if (contentOffset.y + layoutMeasurement.height > contentSize.height - 600) {
      loadMoreRef.current?.();
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetchProfile(),
        refetchStats(),
        refreshRef.current?.(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const onFollow = () => {
    if (!profileData) return;
    setFollows((prev) => new Set(prev).add(profileData.did));
    followAccount(profileData.did);
  };

  const onUnfollow = () => {
    if (!profileData) return;
    setFollows((prev) => {
      const n = new Set(prev);
      n.delete(profileData.did);
      return n;
    });
    unfollowAccount(profileData.did);
  };

  const displayProfile = profileData || profile;

  // Browsing is public; the own-profile tab needs a session to know whose
  // profile to show.
  if (!did) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.background }}
        edges={["top", "left", "right"]}
      >
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
          }}
        >
          <Text style={{ fontSize: 14, color: colors.textMuted }}>
            Sign in to view your profile.
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate("SignIn")}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 24,
              paddingHorizontal: 28,
              paddingVertical: 10,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#fff" }}>
              Sign in
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const renderTabContent = () => {
    if (!resolvedDid) return null;
    switch (activeTab) {
      case 0:
        return (
          <OverviewTab
            did={resolvedDid}
            navigation={navigation}
            refreshRef={refreshRef}
          />
        );
      case 1:
        return (
          <LibraryTab
            did={resolvedDid}
            navigation={navigation}
            refreshRef={refreshRef}
          />
        );
      case 2:
        return (
          <UserListTab
            actor={resolvedDid}
            type="followers"
            navigation={navigation}
            loadMoreRef={loadMoreRef}
            refreshRef={refreshRef}
          />
        );
      case 3:
        return (
          <UserListTab
            actor={resolvedDid}
            type="following"
            navigation={navigation}
            loadMoreRef={loadMoreRef}
            refreshRef={refreshRef}
          />
        );
      case 4:
        return (
          <CirclesTab
            did={resolvedDid}
            handle={displayProfile?.handle || ""}
            navigation={navigation}
            refreshRef={refreshRef}
          />
        );
      case 5:
        return (
          <LovedTracksTab
            did={resolvedDid}
            navigation={navigation}
            refreshRef={refreshRef}
          />
        );
    }
    return null;
  };

  const renderTabs = () => (
    <ScrollView
      horizontal
      removeClippedSubviews={false}
      showsHorizontalScrollIndicator={false}
      style={{ height: 48, flexGrow: 0, backgroundColor: colors.background }}
      contentContainerStyle={{
        flexDirection: "row",
        alignItems: "stretch",
      }}
    >
      {TABS.map((tab, i) => (
        <TouchableOpacity
          key={tab}
          onPress={() => setActiveTab(i)}
          style={{
            paddingHorizontal: 14,
            justifyContent: "center",
            borderBottomWidth: 2,
            borderBottomColor: activeTab === i ? colors.primary : "transparent",
          }}
        >
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.5}
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: activeTab === i ? colors.primary : colors.textMuted,
            }}
          >
            {tab}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const isUserListTab = activeTab === 2 || activeTab === 3;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top", "left", "right"]}
    >
      <TouchableOpacity
        onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 16,
          paddingVertical: 8,
          backgroundColor: colors.background,
          height: 48,
          flexShrink: 0,
        }}
      >
        <TouchableOpacity
          accessibilityLabel={isOwnProfile ? "Open account menu" : "Back"}
          hitSlop={8}
          onPress={(event) => {
            event.stopPropagation();
            if (isOwnProfile && token) setDrawerOpen(true);
            else navigation.goBack();
          }}
        >
          <Feather
            name={isOwnProfile ? "menu" : "arrow-left"}
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
        {pinned && <Avatar uri={displayProfile?.avatar} size={32} />}
        <View
          style={{ flex: 1, opacity: pinned ? 1 : 0 }}
          accessibilityElementsHidden={!pinned}
          importantForAccessibility={pinned ? "auto" : "no-hide-descendants"}
        >
          <Text
            numberOfLines={1}
            style={{ fontSize: 14, fontWeight: "600", color: colors.text }}
          >
            {displayProfile?.displayName}
          </Text>
          <Text
            numberOfLines={1}
            style={{ fontSize: 11, color: colors.textMuted }}
          >
            @{displayProfile?.handle}
          </Text>
        </View>
      </TouchableOpacity>
      <ScrollView
        ref={scrollRef}
        stickyHeaderIndices={[1]}
        removeClippedSubviews={false}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header */}
        <View
          style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 }}
        >
          {isLoading ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 16,
                marginBottom: 12,
              }}
            >
              <View
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  backgroundColor: colors.surface2,
                }}
              />
              <View style={{ flex: 1, gap: 8 }}>
                <View
                  style={{
                    width: 120,
                    height: 16,
                    borderRadius: 4,
                    backgroundColor: colors.surface2,
                  }}
                />
                <View
                  style={{
                    width: 80,
                    height: 12,
                    borderRadius: 4,
                    backgroundColor: colors.surface2,
                  }}
                />
              </View>
            </View>
          ) : (
            <>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 16,
                  marginBottom: 12,
                }}
              >
                <Avatar uri={displayProfile?.avatar} size={72} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: "800",
                      color: colors.text,
                    }}
                  >
                    {displayProfile?.displayName}
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      Linking.openURL(
                        `https://bsky.app/profile/${displayProfile?.handle}`,
                      )
                    }
                  >
                    <Text style={{ fontSize: 13, color: colors.primary }}>
                      @{displayProfile?.handle}
                    </Text>
                  </TouchableOpacity>
                  <Text
                    style={{
                      fontSize: 11,
                      color: colors.textMuted,
                      marginTop: 2,
                    }}
                  >
                    scrobbling since{" "}
                    {dayjs(displayProfile?.createdAt).format("MMM YYYY")}
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
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "800",
                        color: colors.text,
                      }}
                    >
                      {numeral(value).format("0,0") || "—"}
                    </Text>
                    <Text style={{ fontSize: 10, color: colors.textMuted }}>
                      {label}
                    </Text>
                  </View>
                ))}
              </View>

              {/* A text block measures all lines in normal flow, including long genres. */}
              {genreTags.length > 0 && (
                <Text
                  style={{
                    color: colors.genre,
                    fontSize: 11,
                    lineHeight: 14,
                    includeFontPadding: false,
                    marginBottom: 8,
                    flexShrink: 0,
                  }}
                >
                  {genreTags.map((tag) => `# ${tag}`).join("   ·   ")}
                </Text>
              )}

              {/* Actions */}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {!isOwnProfile && !isFollowing && (
                  <TouchableOpacity
                    onPress={onFollow}
                    style={{
                      paddingHorizontal: 20,
                      paddingVertical: 8,
                      borderRadius: 20,
                      backgroundColor: colors.primary,
                    }}
                  >
                    <Text
                      style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}
                    >
                      + Follow
                    </Text>
                  </TouchableOpacity>
                )}
                {!isOwnProfile && isFollowing && (
                  <TouchableOpacity
                    onPress={onUnfollow}
                    style={{
                      paddingHorizontal: 20,
                      paddingVertical: 8,
                      borderRadius: 20,
                      backgroundColor: colors.surface2,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: 13,
                        fontWeight: "600",
                      }}
                    >
                      ✓ Following
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate("ShareCard", {
                      item: {
                        kind: "profile",
                        uri: resolvedDid,
                        title:
                          displayProfile?.displayName ||
                          displayProfile?.handle ||
                          "Rocksky listener",
                        subtitle: displayProfile?.handle
                          ? `@${displayProfile.handle}`
                          : undefined,
                        artwork: displayProfile?.avatar,
                      },
                    })
                  }
                  style={{
                    paddingHorizontal: 20,
                    paddingVertical: 8,
                    borderRadius: 20,
                    backgroundColor: colors.surface2,
                  }}
                >
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 13,
                      fontWeight: "500",
                    }}
                  >
                    Share
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() =>
                    navigation.navigate("Wrapped", {
                      did: resolvedDid,
                      name:
                        displayProfile?.displayName || displayProfile?.handle,
                    })
                  }
                  style={{
                    paddingHorizontal: 20,
                    paddingVertical: 8,
                    borderRadius: 20,
                    backgroundColor: colors.surface2,
                  }}
                >
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 13,
                      fontWeight: "500",
                    }}
                  >
                    Wrapped
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    Linking.openURL(
                      `https://pdsls.dev/at/${displayProfile?.did}`,
                    )
                  }
                  style={{
                    paddingHorizontal: 20,
                    paddingVertical: 8,
                    borderRadius: 20,
                    backgroundColor: colors.surface2,
                  }}
                >
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 13,
                      fontWeight: "500",
                    }}
                  >
                    PDSls ↗
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Top track */}
              {topTrack && (
                <TopTrackBadge track={topTrack} navigation={navigation} />
              )}
            </>
          )}
        </View>

        {/* One native sticky row survives tab changes and header remeasurement. */}
        <View
          collapsable={false}
          style={{ height: 48, backgroundColor: colors.background }}
        >
          {renderTabs()}
        </View>

        {/* Tab content */}
        <View style={{ paddingHorizontal: isUserListTab ? 0 : 16 }}>
          {renderTabContent()}
        </View>
      </ScrollView>

      {drawerOpen && isOwnProfile && !!token && (
        <ProfileDrawer onClose={() => setDrawerOpen(false)} />
      )}
      <FloatingShoutBar
        uri={`at://${did}`}
        type="profile"
        title={profileData?.displayName}
      />
    </SafeAreaView>
  );
}
