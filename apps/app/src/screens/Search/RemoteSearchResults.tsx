import Feather from "@expo/vector-icons/Feather";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  TouchableOpacity,
  View,
} from "react-native";
import {
  type RemoteSearchEntry,
  remoteLibraries,
} from "../../api/remoteLibraries";
import { PickerSheet } from "../../components/PlaylistSheets";
import { Text } from "../../components/Text";
import { playQueue, queueTracks } from "../../lib/libraryPlayback";
import type { RootStackParamList } from "../../Navigation";
import { colors } from "../../theme";
import { MenuAction } from "../Library/LibraryActions";
import { EntryArtwork, serverQueueTrack } from "../Library/RemoteLibrary";
import RemotePlaylistSheet from "../Library/RemotePlaylistSheet";

export default function RemoteSearchResults({
  query,
  full = false,
  onViewAll,
}: {
  query: string;
  full?: boolean;
  onViewAll: () => void;
}) {
  const focused = useIsFocused();
  const enabled = focused && Platform.OS === "android";
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [menu, setMenu] = useState<RemoteSearchEntry | null>(null);
  const [playlist, setPlaylist] = useState<RemoteSearchEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const libraries = useQuery({
    queryKey: ["remote-libraries"],
    queryFn: remoteLibraries.list,
    enabled,
  });
  const status = useQuery({
    queryKey: ["remote-index-status"],
    queryFn: remoteLibraries.indexStatus,
    enabled: enabled && !!libraries.data?.sources.length,
    refetchInterval: enabled ? 2000 : false,
  });
  const indexing = status.data?.sources.some((s) => s.state === "indexing");
  const results = useInfiniteQuery({
    queryKey: ["remote-index-search", query.trim()],
    queryFn: ({ pageParam }) => remoteLibraries.search(query.trim(), pageParam),
    initialPageParam: 0,
    getNextPageParam: (page, _pages, offset) =>
      page.nextOffset != null && page.nextOffset > offset
        ? page.nextOffset
        : undefined,
    enabled: enabled && !!query.trim() && !!libraries.data?.sources.length,
    staleTime: 30_000,
    retry: false,
    refetchInterval: enabled && indexing ? 2000 : false,
  });
  // Refresh once more after the final page (or source removal) changes the index.
  const version = status.data?.sources
    .map(
      (s) =>
        `${s.sourceId}:${s.state}:${s.completed}:${s.artworkRevision ?? 0}`,
    )
    .join("|");
  useEffect(() => {
    if (enabled && query.trim() && version) void results.refetch();
  }, [enabled, query, version, results.refetch]);
  const entries = [
    ...new Map(
      (results.data?.pages.flatMap((p) => p.entries) ?? []).map((e) => [
        `${e.sourceId}:${e.kind}:${e.id}`,
        e,
      ]),
    ).values(),
  ];
  const run = async (action: () => Promise<unknown>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      Alert.alert(
        "Remote library",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const renderRow = (item: RemoteSearchEntry) => (
    <TouchableOpacity
      key={`${item.sourceId}:${item.kind}:${item.id}`}
      disabled={busy}
      onPress={() => {
        if (item.kind === "track") {
          const tracks = entries.filter((e) => e.kind === "track");
          void run(() =>
            playQueue(
              tracks.map((t) => serverQueueTrack(t.sourceId, t)),
              tracks.findIndex(
                (t) => t.sourceId === item.sourceId && t.id === item.id,
              ),
            ),
          );
        } else
          navigation.navigate("RemoteLibraryDetails", {
            sourceId: item.sourceId,
            entry: { id: item.id, title: item.title },
          });
      }}
      onLongPress={item.kind === "track" ? () => setMenu(item) : undefined}
      style={{
        flexDirection: "row",
        gap: 12,
        alignItems: "center",
        paddingVertical: 10,
      }}
    >
      <EntryArtwork
        key={`${item.sourceId}:${item.id}:${item.art}`}
        item={item}
      />
      <View style={{ flex: 1, gap: 3 }}>
        <Text numberOfLines={1} style={{ fontWeight: "600" }}>
          {item.title}
        </Text>
        <Text
          numberOfLines={1}
          style={{ color: colors.textMuted, fontSize: 12 }}
        >
          {[item.artist, item.sourceName, item.kind]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      {item.kind === "track" && (
        <TouchableOpacity
          disabled={busy}
          accessibilityLabel={`Options for ${item.title}`}
          style={{ padding: 10 }}
          onPress={() => setMenu(item)}
        >
          <Feather name="more-horizontal" size={22} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
  if (libraries.isPending)
    return full ? <ActivityIndicator color={colors.primary} /> : null;
  if (libraries.isError)
    return full ? (
      <MenuAction
        text="Retry loading remote libraries"
        onPress={() => void libraries.refetch()}
      />
    ) : null;
  if (!libraries.data?.sources.length)
    return full ? (
      <Text style={{ color: colors.textMuted, padding: 20 }}>
        Connect a server from Your libraries to search it here.
      </Text>
    ) : null;
  const source = libraries.data.sources.find(
    (s) => s.id === playlist?.sourceId,
  );
  const header = (
    <View style={{ gap: 6, paddingTop: 12 }}>
      <Text style={{ fontWeight: "700" }}>Remote libraries</Text>
      {!!status.data?.sources.length && (
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          {status.data.sources
            .reduce((n, s) => n + s.count, 0)
            .toLocaleString()}{" "}
          indexed items
          {indexing ? " · Indexing… Results are still being added." : ""}
        </Text>
      )}
      {full &&
        status.data?.sources.map((s) => (
          <View
            key={s.sourceId}
            style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
          >
            <Text
              numberOfLines={1}
              style={{ flex: 1, color: colors.textMuted, fontSize: 12 }}
            >
              {s.name}
              {s.state === "error"
                ? " · Refresh incomplete; cached results remain available"
                : ""}
            </Text>
            <TouchableOpacity
              disabled={busy || s.state === "indexing"}
              accessibilityLabel={`Refresh index for ${s.name}`}
              style={{ padding: 10 }}
              onPress={() =>
                void run(async () => {
                  await remoteLibraries.reindex(s.sourceId);
                  await status.refetch();
                })
              }
            >
              <Feather
                name="refresh-cw"
                size={18}
                color={
                  s.state === "indexing" ? colors.textMuted : colors.primary
                }
              />
            </TouchableOpacity>
          </View>
        ))}
      {busy && <ActivityIndicator color={colors.primary} />}
    </View>
  );
  const empty = (
    <Text style={{ color: colors.textMuted, paddingVertical: 16 }}>
      {!query.trim()
        ? "Search your connected libraries"
        : results.isError
          ? "Could not read the search index"
          : indexing
            ? "No matches yet. Indexing is still in progress."
            : "No matches in your indexed libraries."}
    </Text>
  );
  return (
    <View style={full ? { flex: 1 } : undefined}>
      {full ? (
        <FlatList
          data={entries}
          keyExtractor={(item) => `${item.sourceId}:${item.kind}:${item.id}`}
          renderItem={({ item }) => renderRow(item)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
          ListHeaderComponent={header}
          ListEmptyComponent={
            results.isLoading && query.trim() ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              empty
            )
          }
          onEndReached={() => {
            if (results.hasNextPage && !results.isFetching)
              void results.fetchNextPage();
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            results.isFetchingNextPage ? (
              <ActivityIndicator color={colors.primary} />
            ) : results.isError ? (
              <MenuAction
                text="Retry search"
                onPress={() => void results.refetch()}
              />
            ) : results.hasNextPage ? (
              <MenuAction
                text="Load more"
                onPress={() => void results.fetchNextPage()}
              />
            ) : null
          }
        />
      ) : (
        <>
          {header}
          {entries.slice(0, 5).map(renderRow)}
          {!entries.length && empty}
          <MenuAction
            text="Search all remote libraries"
            icon="chevron-right"
            onPress={onViewAll}
          />
        </>
      )}
      {menu && (
        <PickerSheet
          title={menu.title}
          subtitle={menu.sourceName}
          headerArtwork={<EntryArtwork item={menu} />}
          onClose={() => setMenu(null)}
        >
          <MenuAction
            text="Play next"
            icon="corner-down-right"
            onPress={() => {
              const track = menu;
              setMenu(null);
              void run(() =>
                queueTracks([serverQueueTrack(track.sourceId, track)], "next"),
              );
            }}
          />
          <MenuAction
            text="Add to queue"
            icon="list"
            onPress={() => {
              const track = menu;
              setMenu(null);
              void run(() =>
                queueTracks([serverQueueTrack(track.sourceId, track)], "last"),
              );
            }}
          />
          <MenuAction
            text="Add to playlist"
            icon="plus"
            onPress={() => {
              setPlaylist(menu);
              setMenu(null);
            }}
          />
        </PickerSheet>
      )}
      {playlist && source && (
        <RemotePlaylistSheet
          source={source}
          track={playlist}
          onClose={() => setPlaylist(null)}
        />
      )}
    </View>
  );
}
