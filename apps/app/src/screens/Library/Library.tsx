import Feather from "@expo/vector-icons/Feather";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type {
  UploadAlbum,
  UploadArtist,
  UploadedTrack,
} from "@/src/api/uploads";
import LibraryGlyph from "@/src/components/Icons/Library";
import { Text } from "@/src/components/Text";
import {
  useUploadAlbumsInfiniteQuery,
  useUploadArtistsInfiniteQuery,
  useUploadCollectionTracksQuery,
  useUploadsInfiniteQuery,
  useUploadTrackMutation,
} from "@/src/hooks/useUploads";
import {
  isLocalEngineAvailable,
  playUploads,
  type UploadQueueTrack,
} from "@/src/lib/uploadEngine";
import type { RootStackParamList } from "@/src/Navigation";
import { storage } from "@/src/storage";
import { colors } from "@/src/theme";

const SUB_TABS = ["Tracks", "Albums", "Artists"] as const;

// Track and artist rows are a fixed 44px cover plus 9px of padding either side,
// so the lists can skip measuring and mount a window straight away.
const ROW_HEIGHT = 62;

const rowLayout = (
  _data: ArrayLike<unknown> | null | undefined,
  index: number,
) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index });

type CollectionView =
  | { kind: "album"; album: UploadAlbum }
  | { kind: "artist"; artist: UploadArtist }
  | null;

type UploadItem = {
  name: string;
  progress: number;
  status: "uploading" | "done" | "error";
};

function toQueueTrack(item: UploadedTrack): UploadQueueTrack {
  return {
    uploadId: item.upload.id,
    title: item.track.title,
    artist: item.track.artist,
    albumArtist: item.track.albumArtist,
    album: item.track.album,
    albumArt: item.track.albumArt,
    durationMs: item.track.duration,
    songUri: item.track.uri,
    albumUri: item.track.albumUri,
    artistUri: item.track.artistUri,
    sha256: item.track.sha256,
  };
}

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "--:--";
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

async function startPlayback(tracks: UploadedTrack[], index: number) {
  if (!isLocalEngineAvailable()) {
    Alert.alert(
      "Playback unavailable",
      "The native playback engine is not in this build. Rebuild the app with the Rust toolchain installed.",
    );
    return;
  }
  const ok = await playUploads(tracks.map(toQueueTrack), index);
  if (!ok) {
    Alert.alert("Playback failed", "Could not start the playback engine.");
  }
}

function shuffled<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ─── Rows ────────────────────────────────────────────────────────────────────

function CoverArt({ uri, size }: { uri: string | null; size: number }) {
  return (
    <View
      style={[
        styles.coverArt,
        { width: size, height: size, borderRadius: size > 48 ? 10 : 6 },
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size }}
          cachePolicy="memory-disk"
          recyclingKey={uri}
          contentFit="cover"
        />
      ) : (
        <Text style={{ opacity: 0.2 }}>♪</Text>
      )}
    </View>
  );
}

function TrackRow({
  item,
  onPress,
}: {
  item: UploadedTrack;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.trackRow} onPress={onPress}>
      <CoverArt uri={item.track.albumArt} size={44} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {item.track.title}
        </Text>
        <Text numberOfLines={1} style={styles.rowSubtitle}>
          {item.track.artist}
        </Text>
      </View>
      <Text style={styles.rowMeta}>{formatDuration(item.track.duration)}</Text>
    </TouchableOpacity>
  );
}

function AlbumCard({
  album,
  onPress,
}: {
  album: UploadAlbum;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.albumCard} onPress={onPress}>
      <View style={styles.albumArtBox}>
        {album.albumArt ? (
          <Image
            source={{ uri: album.albumArt }}
            style={styles.albumArt}
            cachePolicy="memory-disk"
            recyclingKey={album.albumArt}
            contentFit="cover"
          />
        ) : (
          <View style={styles.albumArtFallback}>
            <Text style={{ opacity: 0.2, fontSize: 22 }}>♪</Text>
          </View>
        )}
      </View>
      <Text numberOfLines={1} style={styles.albumTitle}>
        {album.album}
      </Text>
      <Text numberOfLines={1} style={styles.rowSubtitle}>
        {album.albumArtist}
      </Text>
    </TouchableOpacity>
  );
}

function ArtistRow({
  artist,
  onPress,
}: {
  artist: UploadArtist;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.trackRow} onPress={onPress}>
      <View style={styles.artistBadge}>
        <Text style={{ fontSize: 18, opacity: 0.4 }}>♬</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {artist.name}
        </Text>
        <Text numberOfLines={1} style={styles.rowSubtitle}>
          {artist.trackCount} track{artist.trackCount === 1 ? "" : "s"} ·{" "}
          {artist.albumCount} album{artist.albumCount === 1 ? "" : "s"}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

function EmptyState({ message }: { message: string }) {
  return <Text style={styles.emptyText}>{message}</Text>;
}

function ListFooter({ loading }: { loading: boolean }) {
  if (!loading) return <View style={{ height: 24 }} />;
  return (
    <View style={{ padding: 16, alignItems: "center" }}>
      <ActivityIndicator size="small" color={colors.primary} />
    </View>
  );
}

// ─── Collection (album / artist) view ────────────────────────────────────────

function CollectionHeader({
  title,
  subtitle,
  art,
  onBack,
  onPlay,
  onShuffle,
}: {
  title: string;
  subtitle: string;
  art: string | null;
  onBack: () => void;
  onPlay: () => void;
  onShuffle: () => void;
}) {
  return (
    <View>
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <Feather name="arrow-left" size={18} color={colors.text} />
        <Text style={{ color: colors.text, fontSize: 13 }}>Library</Text>
      </TouchableOpacity>
      <View style={styles.collectionHeader}>
        <CoverArt uri={art} size={84} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={2} style={styles.collectionTitle}>
            {title}
          </Text>
          <Text numberOfLines={1} style={styles.rowSubtitle}>
            {subtitle}
          </Text>
          <View style={styles.collectionActions}>
            <TouchableOpacity style={styles.playButton} onPress={onPlay}>
              <Text style={styles.playButtonText}>▶ Play</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shuffleButton} onPress={onShuffle}>
              <Text style={styles.shuffleButtonText}>Shuffle</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

function CollectionScreen({
  view,
  onBack,
}: {
  view: NonNullable<CollectionView>;
  onBack: () => void;
}) {
  const filters =
    view.kind === "album"
      ? view.album.albumUri
        ? { albumUri: view.album.albumUri }
        : { albumArtist: view.album.albumArtist, albumName: view.album.album }
      : { albumArtist: view.artist.name };
  const { data: tracks, isLoading } = useUploadCollectionTracksQuery(filters);
  const list = tracks ?? [];

  const title = view.kind === "album" ? view.album.album : view.artist.name;
  const subtitle =
    view.kind === "album"
      ? view.album.albumArtist
      : `${view.artist.trackCount} track${view.artist.trackCount === 1 ? "" : "s"}`;
  const art =
    view.kind === "album"
      ? view.album.albumArt
      : (list[0]?.track.albumArt ?? null);

  return (
    <FlatList
      data={list}
      keyExtractor={(item) => item.upload.id}
      renderItem={({ item, index }) => (
        <TrackRow item={item} onPress={() => startPlayback(list, index)} />
      )}
      ListHeaderComponent={
        <CollectionHeader
          title={title}
          subtitle={subtitle}
          art={art}
          onBack={onBack}
          onPlay={() => startPlayback(list, 0)}
          onShuffle={() => startPlayback(shuffled(list), 0)}
        />
      }
      ListEmptyComponent={
        isLoading ? (
          <ListFooter loading />
        ) : (
          <EmptyState message="No tracks here yet" />
        )
      }
      ListFooterComponent={<View style={{ height: 24 }} />}
      showsVerticalScrollIndicator={false}
    />
  );
}

// ─── Upload progress panel ───────────────────────────────────────────────────

function UploadPanel({ items }: { items: UploadItem[] }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.uploadPanel}>
      {items.map((item) => (
        <View key={item.name} style={styles.uploadRow}>
          <Text numberOfLines={1} style={[styles.rowSubtitle, { flex: 1 }]}>
            {item.name}
          </Text>
          <Text style={styles.rowMeta}>
            {item.status === "done"
              ? "✓"
              : item.status === "error"
                ? "failed"
                : `${item.progress}%`}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function Library() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const signedIn = !!storage.getToken();

  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<CollectionView>(null);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const { mutateAsync: upload } = useUploadTrackMutation();

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // All three lists load together rather than on first tab press, like the web
  // client does: the first page of each is in cache by the time a tab is
  // tapped, so switching renders instantly instead of waiting on a request.
  const tracksQuery = useUploadsInfiniteQuery(query, signedIn);
  const albumsQuery = useUploadAlbumsInfiniteQuery(query, signedIn);
  const artistsQuery = useUploadArtistsInfiniteQuery(query, signedIn);

  const tracks: UploadedTrack[] = tracksQuery.data?.pages.flat() ?? [];
  const albums: UploadAlbum[] = albumsQuery.data?.pages.flat() ?? [];
  const artists: UploadArtist[] = artistsQuery.data?.pages.flat() ?? [];

  const pickAndUpload = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "audio/*",
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled || result.assets.length === 0) return;

    setUploadItems(
      result.assets.map((asset) => ({
        name: asset.name,
        progress: 0,
        status: "uploading" as const,
      })),
    );
    for (const asset of result.assets) {
      const setItem = (patch: Partial<UploadItem>) =>
        setUploadItems((prev) =>
          prev.map((item) =>
            item.name === asset.name ? { ...item, ...patch } : item,
          ),
        );
      try {
        await upload({
          file: {
            uri: asset.uri,
            name: asset.name,
            mimeType: asset.mimeType ?? "audio/mpeg",
          },
          onProgress: (percent) => setItem({ progress: percent }),
        });
        setItem({ status: "done", progress: 100 });
      } catch {
        setItem({ status: "error" });
      }
    }
    setTimeout(() => setUploadItems([]), 4000);
  };

  if (!signedIn) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <View style={styles.signInWrap}>
          <LibraryGlyph size={40} color={colors.textMuted} />
          <Text style={{ fontSize: 14, color: colors.textMuted }}>
            Sign in to browse and upload your music.
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate("SignIn")}
            style={styles.signInButton}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#fff" }}>
              Sign in
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (view) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <CollectionScreen view={view} onBack={() => setView(null)} />
        <UploadPanel items={uploadItems} />
      </SafeAreaView>
    );
  }

  const loadingMore =
    (tab === 0 && tracksQuery.isFetchingNextPage) ||
    (tab === 1 && albumsQuery.isFetchingNextPage) ||
    (tab === 2 && artistsQuery.isFetchingNextPage);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Library</Text>
        <TouchableOpacity style={styles.uploadButton} onPress={pickAndUpload}>
          <Feather name="upload" size={14} color="#fff" />
          <Text style={styles.uploadButtonText}>Upload</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchBox}>
        <Feather name="search" size={14} color={colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search your uploads"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Sub-tabs */}
      <View style={styles.pillRow}>
        {SUB_TABS.map((label, i) => (
          <TouchableOpacity
            key={label}
            onPress={() => setTab(i)}
            style={[styles.pill, tab === i && styles.pillActive]}
          >
            <Text style={[styles.pillText, tab === i && styles.pillTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Lists */}
      {tab === 0 && (
        <FlatList
          data={tracks}
          keyExtractor={(item) => item.upload.id}
          renderItem={({ item, index }) => (
            <TrackRow
              item={item}
              onPress={() => startPlayback(tracks, index)}
            />
          )}
          onEndReached={() =>
            tracksQuery.hasNextPage &&
            !tracksQuery.isFetchingNextPage &&
            tracksQuery.fetchNextPage()
          }
          onEndReachedThreshold={0.4}
          getItemLayout={rowLayout}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={9}
          ListEmptyComponent={
            tracksQuery.isLoading ? (
              <ListFooter loading />
            ) : (
              <EmptyState
                message={
                  query
                    ? "No uploads match your search"
                    : "No uploads yet — tap Upload to add your music"
                }
              />
            )
          }
          ListFooterComponent={<ListFooter loading={loadingMore} />}
          showsVerticalScrollIndicator={false}
        />
      )}
      {tab === 1 && (
        <FlatList
          data={albums}
          keyExtractor={(item) =>
            item.albumUri ?? `${item.albumArtist}-${item.album}`
          }
          numColumns={3}
          columnWrapperStyle={{ gap: 10 }}
          renderItem={({ item }) => (
            <AlbumCard
              album={item}
              onPress={() => setView({ kind: "album", album: item })}
            />
          )}
          onEndReached={() =>
            albumsQuery.hasNextPage &&
            !albumsQuery.isFetchingNextPage &&
            albumsQuery.fetchNextPage()
          }
          onEndReachedThreshold={0.4}
          initialNumToRender={9}
          maxToRenderPerBatch={9}
          windowSize={7}
          ListEmptyComponent={
            albumsQuery.isLoading ? (
              <ListFooter loading />
            ) : (
              <EmptyState message="No albums yet" />
            )
          }
          ListFooterComponent={<ListFooter loading={loadingMore} />}
          showsVerticalScrollIndicator={false}
        />
      )}
      {tab === 2 && (
        <FlatList
          data={artists}
          keyExtractor={(item) => item.artistUri ?? item.name}
          renderItem={({ item }) => (
            <ArtistRow
              artist={item}
              onPress={() => setView({ kind: "artist", artist: item })}
            />
          )}
          onEndReached={() =>
            artistsQuery.hasNextPage &&
            !artistsQuery.isFetchingNextPage &&
            artistsQuery.fetchNextPage()
          }
          onEndReachedThreshold={0.4}
          getItemLayout={rowLayout}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={9}
          ListEmptyComponent={
            artistsQuery.isLoading ? (
              <ListFooter loading />
            ) : (
              <EmptyState message="No artists yet" />
            )
          }
          ListFooterComponent={<ListFooter loading={loadingMore} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      <UploadPanel items={uploadItems} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  uploadButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.inputBackground,
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    paddingVertical: 9,
  },
  pillRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.surface2,
  },
  pillActive: {
    backgroundColor: colors.primary,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  pillTextActive: {
    color: "#fff",
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    gap: 12,
  },
  coverArt: {
    overflow: "hidden",
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.text,
  },
  rowSubtitle: {
    fontSize: 11,
    color: colors.textMuted,
  },
  rowMeta: {
    fontSize: 11,
    color: colors.textMuted,
  },
  artistBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  albumCard: {
    flex: 1 / 3,
    marginBottom: 14,
  },
  albumArtBox: {
    aspectRatio: 1,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: colors.surface2,
    marginBottom: 5,
  },
  albumArt: {
    width: "100%",
    height: "100%",
  },
  albumArtFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  albumTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.text,
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: 40,
    fontSize: 13,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 14,
  },
  collectionHeader: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 16,
  },
  collectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.text,
  },
  collectionActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  playButton: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  playButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  shuffleButton: {
    backgroundColor: colors.surface2,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  shuffleButtonText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "600",
  },
  uploadPanel: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 6,
  },
  uploadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  signInWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  signInButton: {
    backgroundColor: colors.primary,
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingVertical: 10,
  },
});
