import Feather from "@expo/vector-icons/Feather";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  type LibraryEntry,
  type LibrarySource,
  type PlaylistItem,
  remoteLibraries,
} from "../../api/remoteLibraries";
import { PickerSheet } from "../../components/PlaylistSheets";
import { Text } from "../../components/Text";
import { colors } from "../../theme";
import { MenuAction } from "./LibraryActions";

export default function RemotePlaylistSheet({
  source,
  track,
  onClose,
}: {
  source: LibrarySource;
  track?: LibraryEntry;
  onClose: () => void;
}) {
  const cache = useQueryClient();
  const [path, setPath] = useState<LibraryEntry[]>([]);
  const [selected, setSelected] = useState<LibraryEntry | null>(null);
  const [form, setForm] = useState<"create" | "rename" | null>(null);
  const [name, setName] = useState("");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const capabilities = useQuery({
    queryKey: ["remote-playlist-capabilities", source.id],
    queryFn: () => remoteLibraries.playlistCapabilities(source.id),
    staleTime: 300_000,
  });
  const caps = capabilities.data;
  const folder = path.at(-1)?.id ?? "";
  const destinations = useInfiniteQuery({
    queryKey: ["remote-playlists", source.id, folder],
    queryFn: ({ pageParam }) =>
      remoteLibraries.writablePlaylists(source.id, folder, pageParam),
    initialPageParam: 0,
    getNextPageParam: (page, _pages, offset) =>
      page.nextOffset != null && page.nextOffset > offset
        ? page.nextOffset
        : undefined,
    enabled: !selected,
  });
  const songs = useInfiniteQuery({
    queryKey: ["remote-playlist-items", source.id, selected?.id],
    queryFn: ({ pageParam }) =>
      remoteLibraries.playlistOperation(source.id, "items", {
        playlistId: selected?.id,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (page, _pages, offset) =>
      page.nextOffset != null && page.nextOffset > offset
        ? page.nextOffset
        : undefined,
    enabled: !!selected && !track && caps?.items === true,
  });
  const items = songs.data?.pages.flatMap((p) => p.entries) ?? [];
  const playlists = destinations.data?.pages.flatMap((p) => p.entries) ?? [];
  const invalidate = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["remote-library", source.id] }),
      cache.invalidateQueries({ queryKey: ["remote-playlists", source.id] }),
      cache.resetQueries({ queryKey: ["remote-playlist-items", source.id] }),
    ]);
  };
  const perform = async (action: () => Promise<unknown>, done?: () => void) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      await action();
      await invalidate();
      done?.();
    } catch (error) {
      Alert.alert(
        "Could not update playlist",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const editItem = (
    item: PlaylistItem,
    operation: "remove" | "move",
    delta = 0,
  ) => {
    const target = item.position + delta;
    const after =
      delta < 0
        ? items.find((i) => i.position === target - 1)
        : items.find((i) => i.position === target);
    void perform(() =>
      remoteLibraries.playlistOperation(source.id, operation, {
        playlistId: selected?.id,
        id: item.id,
        entryId: item.entryId,
        position: item.position,
        target,
        afterEntryId: after?.entryId,
      }),
    );
  };
  const save = () =>
    void perform(
      async () => {
        if (form === "rename")
          return remoteLibraries.playlistOperation(source.id, "rename", {
            playlistId: selected?.id,
            name: name.trim(),
          });
        const created = await remoteLibraries.playlistOperation(
          source.id,
          "create",
          { name: name.trim(), parentId: folder },
        );
        // Creation and addition are separate: never create another playlist on an add failure.
        setForm(null);
        setName("");
        if (track && created.playlistId) {
          try {
            await remoteLibraries.addToPlaylist(
              source.id,
              created.playlistId,
              track.id,
            );
          } catch (error) {
            await invalidate();
            throw error;
          }
        }
      },
      () => {
        if (form === "rename" && selected)
          setSelected({ ...selected, title: name.trim() });
        setForm(null);
        setName("");
        if (track && form === "create") onClose();
      },
    );
  const more = (query: typeof destinations | typeof songs) => {
    if (query.hasNextPage && !query.isFetching) void query.fetchNextPage();
  };
  return (
    <PickerSheet
      title={
        form
          ? form === "create"
            ? "New playlist"
            : "Rename playlist"
          : (selected?.title ??
            (track ? "Add to playlist" : "Manage playlists"))
      }
      subtitle={source.name}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <View style={{ maxHeight: 480, gap: 10 }}>
        <Text style={{ color: colors.textMuted }}>
          {source.name}
          {source.kind === "kodi"
            ? " · Changes affect Kodi’s current queue, not a saved file."
            : ""}
        </Text>
        {(busy || capabilities.isPending) && (
          <ActivityIndicator color={colors.primary} />
        )}
        {capabilities.isError && (
          <MenuAction
            text="Retry playlist capabilities"
            onPress={() => void capabilities.refetch()}
          />
        )}
        {track && caps?.add === false && (
          <Text>This server does not support adding tracks to playlists.</Text>
        )}
        {form ? (
          <>
            <TextInput
              autoFocus
              accessibilityLabel="Playlist name"
              placeholder="Playlist name"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
              maxLength={200}
              style={{
                color: colors.text,
                padding: 12,
                borderRadius: 8,
                backgroundColor: colors.surface2,
              }}
              editable={!busy}
              onSubmitEditing={() => {
                if (name.trim()) save();
              }}
            />
            <MenuAction
              text="Save"
              icon="check"
              disabled={busy || !name.trim()}
              onPress={save}
            />
            <MenuAction
              text="Cancel"
              disabled={busy}
              onPress={() => setForm(null)}
            />
          </>
        ) : selected ? (
          <>
            <MenuAction
              text="Back to playlists"
              icon="arrow-left"
              disabled={busy}
              onPress={() => setSelected(null)}
            />
            {caps?.rename && (
              <MenuAction
                text="Rename playlist"
                icon="edit-2"
                disabled={busy}
                onPress={() => {
                  setName(selected.title);
                  setForm("rename");
                }}
              />
            )}
            {caps?.delete && (
              <MenuAction
                text={
                  source.kind === "kodi"
                    ? "Clear current playlist"
                    : "Delete playlist"
                }
                icon="trash-2"
                disabled={busy}
                onPress={() =>
                  Alert.alert(
                    source.kind === "kodi"
                      ? "Clear current playlist?"
                      : "Delete playlist?",
                    `“${selected.title}” on ${source.name}. Music files will be kept.`,
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: source.kind === "kodi" ? "Clear" : "Delete",
                        style: "destructive",
                        onPress: () =>
                          void perform(
                            () =>
                              remoteLibraries.playlistOperation(
                                source.id,
                                "delete",
                                { playlistId: selected.id },
                              ),
                            () => setSelected(null),
                          ),
                      },
                    ],
                  )
                }
              />
            )}
            {caps?.items && (
              <FlatList
                data={items}
                keyExtractor={(item) => `${item.position}:${item.entryId}`}
                keyboardShouldPersistTaps="handled"
                style={{ flexGrow: 0 }}
                renderItem={({ item, index }) => (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 6,
                      gap: 6,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1}>{item.title}</Text>
                      <Text
                        numberOfLines={1}
                        style={{ color: colors.textMuted, fontSize: 12 }}
                      >
                        {item.artist}
                      </Text>
                    </View>
                    {(
                      [
                        [-1, "arrow-up"],
                        [1, "arrow-down"],
                        [0, "minus-circle"],
                      ] as const
                    ).map(([delta, icon]) => {
                      const disabled =
                        busy ||
                        (delta !== 0 && !caps?.move) ||
                        (delta === 0 && item.removable === false) ||
                        (delta < 0 && index === 0) ||
                        (delta > 0 && index === items.length - 1);
                      return (
                        <TouchableOpacity
                          key={icon}
                          disabled={disabled}
                          accessibilityLabel={
                            delta
                              ? `Move ${item.title} ${delta < 0 ? "up" : "down"}`
                              : `Remove ${item.title} from playlist`
                          }
                          style={{ padding: 10, opacity: disabled ? 0.3 : 1 }}
                          onPress={() =>
                            editItem(item, delta ? "move" : "remove", delta)
                          }
                        >
                          <Feather
                            name={icon}
                            size={19}
                            color={colors.textMuted}
                          />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
                onEndReached={() => more(songs)}
                onEndReachedThreshold={0.4}
                ListEmptyComponent={
                  songs.isPending ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Text>
                      {songs.isError
                        ? songs.error.message
                        : "No tracks in this playlist."}
                    </Text>
                  )
                }
                ListFooterComponent={
                  <>
                    {songs.isError && (
                      <MenuAction
                        text="Retry"
                        disabled={busy}
                        onPress={() => void songs.refetch()}
                      />
                    )}
                    {songs.hasNextPage && (
                      <MenuAction
                        text={
                          songs.isFetchingNextPage ? "Loading…" : "Load more"
                        }
                        disabled={songs.isFetchingNextPage || busy}
                        onPress={() => more(songs)}
                      />
                    )}
                  </>
                }
              />
            )}
          </>
        ) : (
          <>
            {caps?.create && (
              <MenuAction
                text="Create playlist"
                icon="plus"
                disabled={busy}
                onPress={() => {
                  setName("");
                  setForm("create");
                }}
              />
            )}
            {path.length > 0 && (
              <MenuAction
                text="Back"
                icon="arrow-left"
                disabled={busy}
                onPress={() => setPath((p) => p.slice(0, -1))}
              />
            )}
            {source.kind === "upnp" && (
              <Text style={{ color: colors.textMuted }}>
                Browse to a writable playlist on your server.
              </Text>
            )}
            <TextInput
              accessibilityLabel="Filter playlists"
              placeholder="Filter loaded playlists"
              placeholderTextColor={colors.textMuted}
              value={filter}
              onChangeText={setFilter}
              style={{
                padding: 10,
                color: colors.text,
                backgroundColor: colors.surface2,
                borderRadius: 8,
              }}
            />
            <FlatList
              data={playlists.filter((p) =>
                p.title.toLowerCase().includes(filter.toLowerCase()),
              )}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              style={{ flexGrow: 0 }}
              renderItem={({ item }) => (
                <MenuAction
                  text={item.title}
                  icon={item.kind === "playlist" ? "list" : "folder"}
                  disabled={
                    busy ||
                    (item.kind === "playlist" && !!track && caps?.add !== true)
                  }
                  onPress={() => {
                    if (item.kind !== "playlist") {
                      setPath((p) => [...p, item]);
                      setFilter("");
                    } else if (track)
                      void perform(
                        () =>
                          remoteLibraries.addToPlaylist(
                            source.id,
                            item.id,
                            track.id,
                          ),
                        () => {
                          onClose();
                          Alert.alert("Added to playlist", item.title);
                        },
                      );
                    else setSelected(item);
                  }}
                />
              )}
              onEndReached={() => more(destinations)}
              onEndReachedThreshold={0.4}
              ListEmptyComponent={
                destinations.isPending ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={{ color: colors.textMuted }}>
                    {destinations.isError
                      ? destinations.error.message
                      : "No editable playlists here."}
                  </Text>
                )
              }
              ListFooterComponent={
                <>
                  {destinations.isError && (
                    <MenuAction
                      text="Retry"
                      onPress={() => void destinations.refetch()}
                    />
                  )}
                  {destinations.hasNextPage && (
                    <MenuAction
                      text={
                        destinations.isFetchingNextPage
                          ? "Loading…"
                          : "Load more"
                      }
                      disabled={destinations.isFetchingNextPage || busy}
                      onPress={() => more(destinations)}
                    />
                  )}
                </>
              }
            />
          </>
        )}
      </View>
    </PickerSheet>
  );
}
