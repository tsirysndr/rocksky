import Feather from "@expo/vector-icons/Feather";
import { type ReactNode, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { coverArtUrlOf } from "../api/navidrome";
import { useNavidromePlaylistsQuery } from "../hooks/useNavidrome";
import {
  PlaylistCreationError,
  PlaylistMirrorWarning,
  useAddTrackToPlaylistMutation,
  useCreatePlaylistMutation,
} from "../hooks/usePlaylists";
import { useUploadsInfiniteQuery } from "../hooks/useUploads";
import { colors } from "../theme";
import PlaylistCover from "./PlaylistCover";
import { Text } from "./Text";

export function PickerSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: "flex-end" }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)" }} />
        </Pressable>
        <View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
        >
          <View style={styles.row}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityLabel="Close"
              style={styles.icon}
            >
              <Feather name="x" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
export function NewPlaylistSheet({
  onClose,
  seedSongId,
}: {
  onClose: () => void;
  seedSongId?: string;
}) {
  const [name, setName] = useState("");
  const [step, setStep] = useState<"name" | "tracks">("name");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState(
    new Set(seedSongId ? [seedSongId] : []),
  );
  const [retry, setRetry] = useState<PlaylistCreationError | null>(null);
  const create = useCreatePlaylistMutation();
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const tracks = useUploadsInfiniteQuery(debounced, step === "tracks");
  const close = () => {
    if (!create.isPending) onClose();
  };
  const save = () =>
    create.mutate(
      {
        name: name.trim(),
        songIds: retry?.remainingSongIds ?? [...selected],
        playlistId: retry?.playlistId,
      },
      {
        onSuccess: ({ warnings }) => {
          onClose();
          if (warnings.length)
            Alert.alert("Saved, but not published", warnings[0]);
        },
        onError: (error) => {
          if (error instanceof PlaylistCreationError) setRetry(error);
          Alert.alert(
            "Could not finish playlist",
            error instanceof PlaylistCreationError
              ? "The playlist was created. Retry to add the remaining tracks without creating it again."
              : error.message,
          );
        },
      },
    );
  return (
    <PickerSheet
      title={step === "name" ? "New playlist" : name.trim()}
      onClose={close}
    >
      {step === "name" ? (
        <>
          <TextInput
            autoFocus
            placeholder="Playlist title"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
            maxLength={120}
            style={styles.input}
            returnKeyType="next"
            onSubmitEditing={() => {
              if (name.trim()) setStep("tracks");
            }}
          />
          <TouchableOpacity
            disabled={!name.trim()}
            style={[styles.button, !name.trim() && { opacity: 0.4 }]}
            onPress={() => setStep("tracks")}
          >
            <Text style={styles.buttonText}>Next: Add tracks</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          {!retry && (
            <TextInput
              autoFocus
              placeholder="Search your library for tracks"
              accessibilityLabel="Search tracks"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              style={styles.input}
            />
          )}
          <Text style={styles.muted}>
            {selected.size} track{selected.size === 1 ? "" : "s"} selected
          </Text>
          {!retry && (
            <FlatList
              data={tracks.data?.pages.flat() ?? []}
              keyExtractor={(item) => item.upload.id}
              keyboardShouldPersistTaps="handled"
              style={{ minHeight: 120 }}
              onEndReached={() => {
                if (tracks.hasNextPage && !tracks.isFetchingNextPage)
                  void tracks.fetchNextPage();
              }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  disabled={create.isPending}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected.has(item.track.id) }}
                  style={styles.row}
                  onPress={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(item.track.id)) next.delete(item.track.id);
                      else next.add(item.track.id);
                      return next;
                    })
                  }
                >
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1}>{item.track.title}</Text>
                    <Text numberOfLines={1} style={styles.muted}>
                      {item.track.artist}
                    </Text>
                  </View>
                  <Feather
                    name={
                      selected.has(item.track.id) ? "check-square" : "square"
                    }
                    size={22}
                    color={colors.primary}
                  />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                tracks.isLoading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.muted}>
                    {tracks.isError
                      ? "Could not load tracks."
                      : "No tracks found"}
                  </Text>
                )
              }
              ListFooterComponent={
                tracks.isError ? (
                  <TouchableOpacity onPress={() => void tracks.refetch()}>
                    <Text style={styles.muted}>Retry search</Text>
                  </TouchableOpacity>
                ) : tracks.isFetchingNextPage ? (
                  <ActivityIndicator color={colors.primary} />
                ) : null
              }
            />
          )}
          <TouchableOpacity
            disabled={create.isPending}
            style={styles.button}
            onPress={save}
          >
            {create.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {retry
                  ? "Retry remaining tracks"
                  : `Create playlist${selected.size ? ` (${selected.size})` : ""}`}
              </Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </PickerSheet>
  );
}
export function AddToPlaylistSheet({
  songId,
  onClose,
}: {
  songId: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const playlists = useNavidromePlaylistsQuery();
  const add = useAddTrackToPlaylistMutation();
  const results = (playlists.data ?? []).filter((item) =>
    item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  if (creating)
    return <NewPlaylistSheet seedSongId={songId} onClose={onClose} />;
  return (
    <PickerSheet
      title="Add to playlist…"
      onClose={() => {
        if (!add.isPending) onClose();
      }}
    >
      <TextInput
        autoFocus
        placeholder="Search playlists"
        accessibilityLabel="Search playlists"
        value={query}
        onChangeText={setQuery}
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />
      <TouchableOpacity
        disabled={add.isPending}
        style={styles.row}
        onPress={() => setCreating(true)}
      >
        <Feather name="plus" size={20} color={colors.primary} />
        <Text>New playlist…</Text>
      </TouchableOpacity>
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <TouchableOpacity
            disabled={add.isPending}
            style={styles.row}
            onPress={() =>
              add.mutate(
                { playlistId: item.id, songId },
                {
                  onSuccess: onClose,
                  onError: (error) => {
                    if (error instanceof PlaylistMirrorWarning) onClose();
                    Alert.alert(
                      error instanceof PlaylistMirrorWarning
                        ? "Saved, but not published"
                        : "Could not add track",
                      error.message,
                    );
                  },
                },
              )
            }
          >
            <PlaylistCover
              picture={coverArtUrlOf(item)}
              trackArts={item.trackArts}
              size={40}
            />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1}>{item.name}</Text>
              <Text style={styles.muted}>{item.songCount} tracks</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          playlists.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.muted}>
              {playlists.isError
                ? "Could not load playlists"
                : "No playlists found"}
            </Text>
          )
        }
      />
      {playlists.isError && (
        <TouchableOpacity onPress={() => void playlists.refetch()}>
          <Text style={styles.muted}>Retry</Text>
        </TouchableOpacity>
      )}
      {add.isPending && <ActivityIndicator color={colors.primary} />}
    </PickerSheet>
  );
}
export const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.surface,
    padding: 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  title: { fontSize: 20, fontWeight: "700", flex: 1 },
  icon: { padding: 6 },
  input: {
    backgroundColor: colors.surface2,
    color: colors.text,
    padding: 14,
    borderRadius: 12,
    marginVertical: 10,
    fontSize: 15,
  },
  muted: { color: colors.textMuted, fontSize: 13, paddingVertical: 6 },
  button: {
    backgroundColor: colors.primary,
    padding: 14,
    alignItems: "center",
    borderRadius: 12,
    marginTop: 12,
  },
  buttonText: { color: "#fff", fontWeight: "700" },
});
