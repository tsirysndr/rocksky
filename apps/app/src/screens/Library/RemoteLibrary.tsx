import Feather from "@expo/vector-icons/Feather";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  type InfiniteData,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  type LibraryEntry,
  type LibraryPage,
  type LibrarySource,
  remoteLibraries,
} from "../../api/remoteLibraries";
import { PickerSheet } from "../../components/PlaylistSheets";
import { Text } from "../../components/Text";
import { playQueue, queueTracks } from "../../lib/libraryPlayback";
import type { UploadQueueTrack } from "../../lib/uploadEngine";
import { colors } from "../../theme";
import { MenuAction } from "./LibraryActions";
import LibraryList from "./LibraryList";
import RemotePlaylistSheet from "./RemotePlaylistSheet";
import { libraryStyles } from "./LibraryStyles";

export function serverQueueTrack(
  sourceId: string,
  item: LibraryEntry,
): UploadQueueTrack {
  return {
    remoteLibraryId: sourceId,
    remoteTrackId: item.id,
    uploadId: `server:${sourceId}:${item.id}`,
    title: item.title,
    artist: item.artist,
    albumArtist: item.artist,
    album: item.album,
    albumArt: item.art,
    durationMs: item.durationMs,
    songUri: null,
    albumUri: null,
    artistUri: null,
    sha256: "",
  };
}
export function EntryArtwork({ item }: { item: LibraryEntry }) {
  const [failed, setFailed] = useState(false);
  const round = item.kind === "artist";
  return (
    <View style={[styles.art, round && { borderRadius: 23 }]}>
      {item.art && !failed ? (
        <Image
          source={{ uri: item.art }}
          cachePolicy="memory"
          contentFit="cover"
          style={{ width: 46, height: 46, borderRadius: round ? 23 : 0 }}
          onError={() => setFailed(true)}
        />
      ) : (
        <LinearGradient
          colors={[colors.surface3, colors.surface]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.artPlaceholder}
        >
          <View style={[styles.placeholderRing, round && { borderRadius: 18 }]}>
            {round ? (
              <Ionicons name="person" size={22} color={colors.textMuted} />
            ) : (
              <Feather
                name={
                  item.kind === "album"
                    ? "disc"
                    : item.kind === "track"
                      ? "music"
                      : "folder"
                }
                size={22}
                color={colors.textMuted}
              />
            )}
          </View>
        </LinearGradient>
      )}
    </View>
  );
}
export default function RemoteLibrary({
  source,
  sourceSwitcher,
  initialPath = [],
}: {
  source: LibrarySource;
  sourceSwitcher: ReactNode;
  initialPath?: { id: string; title: string }[];
}) {
  const cache = useQueryClient();
  const [path, setPath] =
    useState<{ id: string; title: string }[]>(initialPath);
  const [tab, setTab] = useState("Tracks");
  const [section, setSection] = useState<{ id: string; title: string } | null>(
    null,
  );
  const [upnpCategories, setUpnpCategories] = useState<
    { label: string; id: string }[]
  >([]);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [menuTrack, setMenuTrack] = useState<LibraryEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [playlistSheet, setPlaylistSheet] = useState<{
    track?: LibraryEntry;
    playlist?: LibraryEntry;
  } | null>(null);
  const folder = path.at(-1);
  const categories =
    source.kind === "upnp"
      ? upnpCategories.length
        ? upnpCategories
        : [
            { label: "Tracks", id: "" },
            { label: "Playlists", id: "" },
          ]
      : source.kind === "plex" && !section
        ? []
        : [
            "Tracks",
            "Albums",
            "Artists",
            ...(["navidrome", "jellyfin", "plex", "kodi"].includes(source.kind)
              ? ["Playlists"]
              : []),
            ...(["navidrome", "jellyfin"].includes(source.kind)
              ? ["Favorites"]
              : []),
          ].map((label) => ({
            label,
            id:
              source.kind === "plex"
                ? `${label === "Albums" ? "section" : label.toLowerCase()}:${section?.id}`
                : label.toLowerCase(),
          }));
  const category =
    categories.find((item) => item.label === tab) ?? categories[0];
  const browseId = folder?.id ?? category?.id ?? "";
  const localFilter =
    source.kind === "upnp" ||
    (source.kind === "plex" &&
      !/^(section|artists|tracks|playlists):/.test(browseId));
  const goBack = () => {
    if (path.length) setPath((p) => p.slice(0, -1));
    else setSection(null);
    setSearch("");
    setDebounced("");
  };
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    if (!path.length && !section) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (path.length) setPath((p) => p.slice(0, -1));
      else setSection(null);
      setSearch("");
      setDebounced("");
      return true;
    });
    return () => sub.remove();
  }, [path.length, section]);
  const queryKey = [
    "remote-library",
    source.id,
    browseId,
    localFilter ? "" : debounced,
  ];
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      remoteLibraries.browse(
        source.id,
        browseId,
        localFilter ? "" : debounced,
        pageParam,
      ),
    initialPageParam: 0,
    getNextPageParam: (page, _pages, previousOffset) =>
      page.nextOffset != null && page.nextOffset > previousOffset
        ? page.nextOffset
        : undefined,
    retry: false,
    staleTime: 2 * 60_000,
    gcTime: 15 * 60_000,
    refetchOnMount: false,
  });
  const refresh = async () => {
    await cache.cancelQueries({ queryKey, exact: true });
    cache.setQueryData<InfiniteData<LibraryPage, number>>(queryKey, (data) =>
      data
        ? {
            pages: data.pages.slice(0, 1),
            pageParams: data.pageParams.slice(0, 1),
          }
        : data,
    );
    await query.refetch();
  };
  const loadMore = () => {
    if (query.hasNextPage && !query.isFetching)
      void query.fetchNextPage({ cancelRefetch: false });
  };
  const items = useMemo(
    () => [
      ...new Map(
        query.data?.pages
          .flatMap((p) => p.entries)
          .map((item) => [`${item.kind}:${item.id}`, item]) ?? [],
      ).values(),
    ],
    [query.data],
  );
  useEffect(() => {
    if (source.kind !== "upnp" || upnpCategories.length || !items.length)
      return;
    const aliases: Record<string, string> = {
      tracks: "Tracks",
      songs: "Tracks",
      "all tracks": "Tracks",
      "all songs": "Tracks",
      albums: "Albums",
      artists: "Artists",
      "album artists": "Artists",
      playlists: "Playlists",
      favorites: "Favorites",
      favourites: "Favorites",
    };
    const found = items
      .filter((item) => item.kind === "folder")
      .flatMap((item) => {
        const label = aliases[item.title.trim().toLowerCase()];
        return label ? [{ label, id: item.id }] : [];
      });
    if (found.length >= 2) {
      const order = ["Tracks", "Albums", "Artists", "Playlists", "Favorites"];
      const unique = [
        ...new Map(found.map((item) => [item.label, item])).values(),
      ].sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
      setUpnpCategories([
        ...unique,
        ...(unique.some((c) => c.label === "Playlists")
          ? []
          : [{ label: "Playlists", id: "" }]),
        { label: "Folders", id: "" },
      ]);
      setTab(unique[0].label);
      setPath([]);
      setSearch("");
      setDebounced("");
    }
  }, [source.kind, upnpCategories.length, items]);
  const visible =
    localFilter && search.trim()
      ? items.filter((item) =>
          `${item.title} ${item.artist} ${item.album}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
        )
      : items;
  const tracks = visible.filter((item) => item.kind === "track");
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (e) {
      Alert.alert(
        "Library",
        e instanceof Error ? e.message : "Could not play track",
      );
    } finally {
      setBusy(false);
    }
  };
  const play = (item: LibraryEntry) =>
    void run(() =>
      playQueue(
        tracks.map((track) => serverQueueTrack(source.id, track)),
        Math.max(
          0,
          tracks.findIndex((t) => t.id === item.id),
        ),
      ),
    );
  const more = (item: LibraryEntry) => setMenuTrack(item);
  const shuffle = () => {
    const shuffled = [...tracks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    void run(() =>
      playQueue(
        shuffled.map((track) => serverQueueTrack(source.id, track)),
        0,
      ),
    );
  };
  return (
    <View style={{ flex: 1 }}>
      {sourceSwitcher}
      <LibraryList
        key={`${category?.id ?? "root"}:${folder?.id ?? ""}`}
        data={visible}
        keyExtractor={(item) => `${item.kind}:${item.id}`}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 110,
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            onRefresh={() => void refresh()}
            tintColor={colors.primary}
          />
        }
        header={
          <View style={{ paddingBottom: 12 }}>
            <View style={styles.heading}>
              {(folder || section) && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Back to parent folder"
                  onPress={goBack}
                  style={styles.icon}
                >
                  <Feather name="arrow-left" size={22} color={colors.text} />
                </TouchableOpacity>
              )}
              <Text numberOfLines={2} style={styles.title}>
                {folder?.title ?? section?.title ?? source.name}
              </Text>
              {busy && <ActivityIndicator color={colors.primary} />}
            </View>
          </View>
        }
        tabs={
          <View style={{ gap: 8, paddingHorizontal: 16, paddingBottom: 12 }}>
            <View style={styles.search}>
              <Feather name="search" color={colors.textMuted} size={18} />
              <TextInput
                accessibilityLabel="Search library"
                value={search}
                onChangeText={setSearch}
                placeholder={
                  localFilter ? "Filter loaded items" : "Search music"
                }
                placeholderTextColor={colors.textMuted}
                autoCorrect={false}
                style={styles.input}
              />
              {!!search && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  onPress={() => setSearch("")}
                  style={styles.icon}
                >
                  <Feather name="x" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            {categories.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={libraryStyles.pillBar}
                contentContainerStyle={libraryStyles.pillRow}
              >
                {categories.map((item) => (
                  <Pressable
                    key={item.label}
                    accessibilityRole="tab"
                    accessibilityState={{
                      selected: category?.label === item.label,
                    }}
                    style={[
                      libraryStyles.pill,
                      category?.label === item.label &&
                        libraryStyles.pillActive,
                    ]}
                    onPress={() => {
                      setTab(item.label);
                      setPath([]);
                      setSearch("");
                      setDebounced("");
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        libraryStyles.pillText,
                        category?.label === item.label &&
                          libraryStyles.pillTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        }
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
            {category?.label === "Playlists" &&
              !folder &&
              ["navidrome", "jellyfin", "plex", "kodi", "upnp"].includes(
                source.kind,
              ) && (
                <MenuAction
                  text="Manage playlists"
                  icon="edit"
                  onPress={() => setPlaylistSheet({})}
                />
              )}
            {tracks.length > 0 && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="Play loaded tracks"
                    accessibilityState={{ disabled: busy }}
                    onPress={() => play(tracks[0])}
                    style={[styles.icon, busy && { opacity: 0.45 }]}
                  >
                    <Feather name="play" size={24} color={colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="Shuffle loaded tracks"
                    accessibilityState={{ disabled: busy }}
                    onPress={shuffle}
                    style={[styles.icon, busy && { opacity: 0.45 }]}
                  >
                    <Feather name="shuffle" size={24} color={colors.text} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.note}>
                  {tracks.length} tracks{query.hasNextPage ? " loaded" : ""}
                </Text>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            disabled={busy}
            style={styles.row}
            onPress={() => {
              if (item.kind === "track") play(item);
              else {
                if (source.kind === "plex" && item.id.startsWith("section:")) {
                  setSection({ id: item.id.slice(8), title: item.title });
                  setTab("Tracks");
                  setPath([]);
                } else
                  setPath((p) => [...p, { id: item.id, title: item.title }]);
                setSearch("");
                setDebounced("");
              }
            }}
            onLongPress={() => {
              if (item.kind === "track") more(item);
            }}
            accessibilityRole="button"
          >
            <EntryArtwork
              key={`${source.id}:${item.id}:${item.art}`}
              item={item}
            />
            <View style={{ flex: 1, gap: 3 }}>
              <Text
                numberOfLines={1}
                style={{ fontSize: 15, fontWeight: "600" }}
              >
                {item.title}
              </Text>
              <Text numberOfLines={1} style={styles.note}>
                {item.artist ||
                  (item.kind === "track" ? item.album : "Browse collection")}
              </Text>
            </View>
            {item.kind === "track" ? (
              <TouchableOpacity
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Options for ${item.title}`}
                onPress={() => more(item)}
                style={styles.icon}
              >
                <Feather
                  name="more-horizontal"
                  size={20}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
            ) : (
              <Feather
                name="chevron-right"
                size={20}
                color={colors.textMuted}
              />
            )}
          </TouchableOpacity>
        )}
        onEndReached={() => {
          if (
            query.hasNextPage &&
            !query.isFetching &&
            !query.isFetchNextPageError
          )
            loadMore();
        }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          query.isPending ? (
            <ActivityIndicator color={colors.primary} style={{ margin: 32 }} />
          ) : query.isError ? (
            <View style={styles.empty}>
              <Text style={styles.note}>{query.error.message}</Text>
              <TouchableOpacity onPress={() => void query.refetch()}>
                <Text style={{ color: colors.primary }}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text
              style={[
                styles.note,
                { textAlign: "center", paddingVertical: 32 },
              ]}
            >
              {query.hasNextPage
                ? "No matches in loaded items yet. Load more to continue."
                : "No music found here."}
            </Text>
          )
        }
        ListFooterComponent={
          query.isFetchingNextPage ? (
            <ActivityIndicator color={colors.primary} />
          ) : query.hasNextPage ? (
            <TouchableOpacity
              style={styles.load}
              onPress={loadMore}
              disabled={query.isFetching}
              accessibilityRole="button"
            >
              <Text style={{ color: colors.primary }}>
                {query.isFetchNextPageError
                  ? "Could not load more. Retry"
                  : "Load more"}
              </Text>
            </TouchableOpacity>
          ) : null
        }
      />
      {playlistSheet && (
        <RemotePlaylistSheet
          source={source}
          track={playlistSheet.track}
          onClose={() => setPlaylistSheet(null)}
        />
      )}
      {menuTrack && (
        <PickerSheet
          title={menuTrack.title}
          subtitle={menuTrack.artist}
          artwork={menuTrack.art}
          headerArtwork={
            <EntryArtwork
              key={`${source.id}:${menuTrack.id}:${menuTrack.art}`}
              item={menuTrack}
            />
          }
          onClose={() => setMenuTrack(null)}
        >
          <MenuAction
            text="Add to playlist"
            icon="plus"
            onPress={() => {
              setPlaylistSheet({ track: menuTrack });
              setMenuTrack(null);
            }}
          />
          <MenuAction
            text="Play next"
            icon="corner-down-right"
            onPress={() => {
              const track = menuTrack;
              setMenuTrack(null);
              void run(() =>
                queueTracks([serverQueueTrack(source.id, track)], "next"),
              );
            }}
          />
          <MenuAction
            text="Add to queue"
            icon="list"
            onPress={() => {
              const track = menuTrack;
              setMenuTrack(null);
              void run(() =>
                queueTracks([serverQueueTrack(source.id, track)], "last"),
              );
            }}
          />
        </PickerSheet>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  heading: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 24, fontWeight: "700", flex: 1 },
  icon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 12,
    gap: 8,
    backgroundColor: colors.surface2,
    borderRadius: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    color: colors.text,
    fontFamily: "RockfordSansRegular",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 9,
  },
  artPlaceholder: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderRing: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(191, 174, 195, 0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  art: {
    width: 46,
    height: 46,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 7,
    overflow: "hidden",
  },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  empty: { gap: 16, padding: 24, alignItems: "center" },
  load: { padding: 20, alignItems: "center" },
});
