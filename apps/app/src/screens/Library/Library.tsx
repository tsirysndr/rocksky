import Feather from "@expo/vector-icons/Feather";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Image } from "expo-image";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  artistArtUrlOf,
  coverArtUrlOf,
  dedupeById,
  type NavidromeAlbum,
  type NavidromeArtist,
  type NavidromeCredentials,
  type NavidromePlaylist,
  type NavidromeSong,
} from "@/src/api/navidrome";
import type { UploadedTrack } from "@/src/api/uploads";
import { authTokenAtom } from "@/src/atoms/auth";
import LibraryGlyph from "@/src/components/Icons/Library";
import PlaylistCover from "@/src/components/PlaylistCover";
import {
  AddToPlaylistSheet,
  NewPlaylistSheet,
} from "@/src/components/PlaylistSheets";
import { Text } from "@/src/components/Text";
import {
  fetchArtistQueue,
  resolveArtistIdByName,
  songToQueueTrack,
  useNavidromeAlbumQuery,
  useNavidromeAlbumsInfiniteQuery,
  useNavidromeArtistQuery,
  useNavidromeArtistsQuery,
  useNavidromeCredentials,
  useNavidromeFavoritesQuery,
  useNavidromePlaylistQuery,
  useNavidromePlaylistsQuery,
} from "@/src/hooks/useNavidrome";
import {
  PlaylistMirrorWarning,
  useDeletePlaylistMutation,
  useRemoveTrackFromPlaylistMutation,
  useRenamePlaylistMutation,
} from "@/src/hooks/usePlaylists";
import { useUploadsInfiniteQuery } from "@/src/hooks/useUploads";
import {
  playQueue,
  playUploadedTracks,
  queueTracks,
  uploadToQueueTrack,
} from "@/src/lib/libraryPlayback";
import type { RootStackParamList } from "@/src/Navigation";
import { colors } from "@/src/theme";

const SUB_TABS = [
  "Tracks",
  "Albums",
  "Artists",
  "Playlists",
  "Favorites",
] as const;

// Track and artist rows are a fixed 44px cover plus 9px of padding either side,
// so the lists can skip measuring and mount a window straight away.
const ROW_HEIGHT = 62;

const rowLayout = (
  _data: ArrayLike<unknown> | null | undefined,
  index: number,
) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index });

/** Something opened from a list — enough to draw its header at once. */
type DetailView =
  | {
      kind: "album";
      id: string;
      title: string;
      subtitle: string;
      art: string | null;
    }
  | { kind: "artist"; id: string; name: string; art: string | null }
  | {
      kind: "playlist";
      id: string;
      title: string;
      subtitle: string;
      art: string | null;
      /** Covers for the mosaic, from the row that opened it. */
      trackArts?: string[] | null;
    };

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "--:--";
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function shuffled<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A guarded "fetch the next page" for a FlatList.
 *
 * `onEndReached` fires once per content-size change, so if a page lands
 * without growing the list — duplicates deduped away, a short page — it never
 * re-arms and scrolling stops loading. Web has no such problem: its
 * IntersectionObserver sentinel re-fires whenever the end is in view. Wiring
 * this to `onEndReached` *and* `onMomentumScrollEnd` gets the same behaviour,
 * since every further scroll gesture retries.
 */
const nextPageLoader = (query: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
}) => {
  return () => {
    if (!query.hasNextPage || query.isFetchingNextPage) return;
    query.fetchNextPage();
  };
};

const initialOf = (name: string): string =>
  name.trim().charAt(0).toUpperCase() || "♬";

// ─── Rows ────────────────────────────────────────────────────────────────────

function CoverArt({
  uri,
  size,
  round,
  fallbackLabel,
}: {
  uri: string | null;
  size: number;
  round?: boolean;
  fallbackLabel?: string;
}) {
  return (
    <View
      style={[
        styles.coverArt,
        {
          width: size,
          height: size,
          borderRadius: round ? size / 2 : size > 48 ? 10 : 6,
        },
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
        <Text
          style={{
            opacity: 0.4,
            fontSize: Math.max(14, Math.round(size / 2.6)),
            fontWeight: "700",
            color: colors.textMuted,
          }}
        >
          {fallbackLabel ?? "♪"}
        </Text>
      )}
    </View>
  );
}

function TrackRow({
  item,
  onPress,
  onMore,
}: {
  item: UploadedTrack;
  onPress: () => void;
  onMore: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.trackRow}
      onPress={onPress}
      onLongPress={onMore}
    >
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
      <MoreButton onPress={onMore} />
    </TouchableOpacity>
  );
}

/**
 * A track inside an album. The art is the album's own, shown once in the
 * header, so the row leads with the track number instead.
 */
function SongRow({
  song,
  position,
  art,
  onPress,
  onMore,
}: {
  song: NavidromeSong;
  /** Shown when there is no art: an album's rows lead with the number. */
  position?: number;
  /** Cover for this row, for lists whose tracks come from everywhere. */
  art?: string | null;
  onPress: () => void;
  onMore: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.trackRow}
      onPress={onPress}
      onLongPress={onMore}
    >
      {art === undefined ? (
        <View style={styles.trackNumberCell}>
          <Text style={styles.trackNumber}>{song.track ?? position ?? ""}</Text>
        </View>
      ) : (
        <CoverArt uri={art} size={44} />
      )}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {song.title}
        </Text>
        <Text numberOfLines={1} style={styles.rowSubtitle}>
          {song.artist}
        </Text>
      </View>
      <Text style={styles.rowMeta}>{formatDuration(song.duration * 1000)}</Text>
      <MoreButton onPress={onMore} />
    </TouchableOpacity>
  );
}

function AlbumCard({
  album,
  onPress,
}: {
  album: NavidromeAlbum;
  onPress: () => void;
}) {
  const art = coverArtUrlOf(album);
  return (
    <TouchableOpacity style={styles.albumCard} onPress={onPress}>
      <View style={styles.albumArtBox}>
        {art ? (
          <Image
            source={{ uri: art }}
            style={styles.albumArt}
            cachePolicy="memory-disk"
            recyclingKey={art}
            contentFit="cover"
          />
        ) : (
          <View style={styles.albumArtFallback}>
            <Text style={{ opacity: 0.2, fontSize: 22 }}>♪</Text>
          </View>
        )}
      </View>
      <Text numberOfLines={1} style={styles.albumTitle}>
        {album.name}
      </Text>
      <Text numberOfLines={1} style={styles.rowSubtitle}>
        {album.artist}
      </Text>
    </TouchableOpacity>
  );
}

function ArtistRow({
  artist,
  onPress,
}: {
  artist: NavidromeArtist;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.trackRow} onPress={onPress}>
      <CoverArt
        uri={artistArtUrlOf(artist)}
        size={44}
        round
        fallbackLabel={initialOf(artist.name)}
      />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {artist.name}
        </Text>
        <Text numberOfLines={1} style={styles.rowSubtitle}>
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

// ─── Track context menu ──────────────────────────────────────────────────────

type FeatherName = React.ComponentProps<typeof Feather>["name"];

type SheetAction = {
  label: string;
  icon: FeatherName;
  onPress: () => void;
};

function MoreButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.moreButton}
      hitSlop={8}
      accessibilityLabel="More actions"
    >
      <Feather name="more-horizontal" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

function TrackActionSheet({
  title,
  subtitle,
  art,
  actions,
  onClose,
}: {
  title: string;
  subtitle: string;
  art: string | null;
  actions: SheetAction[];
  onClose: () => void;
}) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <CoverArt uri={art} size={44} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={styles.rowTitle}>
              {title}
            </Text>
            <Text numberOfLines={1} style={styles.rowSubtitle}>
              {subtitle}
            </Text>
          </View>
        </View>
        {actions.map((action) => (
          <TouchableOpacity
            key={action.label}
            style={styles.sheetItem}
            onPress={() => {
              onClose();
              action.onPress();
            }}
          >
            <Feather name={action.icon} size={16} color={colors.text} />
            <Text style={styles.sheetItemText}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </Modal>
  );
}

// ─── Album / artist detail ───────────────────────────────────────────────────

function DetailHeader({
  title,
  subtitle,
  art,
  round,
  fallbackLabel,
  trackArts,
  onBack,
  onPlay,
  onShuffle,
}: {
  title: string;
  subtitle: string;
  art: string | null;
  round?: boolean;
  fallbackLabel?: string;
  /** Given for a playlist: the header then draws the same mosaic as its row. */
  trackArts?: string[] | null;
  onBack: () => void;
  onPlay: () => void;
  onShuffle: () => void;
}) {
  return (
    <View>
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <Feather name="arrow-left" size={18} color={colors.text} />
        <Text style={{ color: colors.text, fontSize: 13 }}>Back</Text>
      </TouchableOpacity>
      <View style={styles.collectionHeader}>
        {trackArts !== undefined ? (
          <PlaylistCover picture={art} trackArts={trackArts} size={84} />
        ) : (
          <CoverArt
            uri={art}
            size={84}
            round={round}
            fallbackLabel={fallbackLabel}
          />
        )}
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

function AlbumDetailScreen({
  view,
  onBack,
  onOpenArtist,
  onAddToPlaylist,
}: {
  view: Extract<DetailView, { kind: "album" }>;
  onBack: () => void;
  onOpenArtist: (artistId: string, name: string) => void;
  onAddToPlaylist: (songId: string) => void;
}) {
  const { data: creds } = useNavidromeCredentials();
  const { data: album, isLoading } = useNavidromeAlbumQuery(view.id);
  const [sheetSong, setSheetSong] = useState<NavidromeSong | null>(null);
  const songs: NavidromeSong[] = useMemo(
    () => dedupeById(album?.song ?? []),
    [album],
  );
  const art = coverArtUrlOf(album) ?? view.art;
  const queue = useMemo(
    () =>
      creds ? songs.map((song) => songToQueueTrack(song, creds, art)) : [],
    [songs, creds, art],
  );

  // One builder for every list's track menu, so the options can't drift apart.
  const sheetActions = (song: NavidromeSong): SheetAction[] =>
    creds
      ? songSheetActions(song, creds, art, onOpenArtist, onAddToPlaylist)
      : [];

  return (
    <>
      <FlatList
        data={songs}
        keyExtractor={(song) => song.id}
        renderItem={({ item, index }) => (
          <SongRow
            song={item}
            position={index + 1}
            onPress={() => playQueue(queue, index)}
            onMore={() => setSheetSong(item)}
          />
        )}
        ListHeaderComponent={
          <DetailHeader
            title={view.title}
            subtitle={view.subtitle}
            art={art}
            onBack={onBack}
            onPlay={() => playQueue(queue, 0)}
            onShuffle={() => playQueue(shuffled(queue), 0)}
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
      {sheetSong && (
        <TrackActionSheet
          title={sheetSong.title}
          subtitle={sheetSong.artist}
          art={coverArtUrlOf(sheetSong) ?? art}
          actions={sheetActions(sheetSong)}
          onClose={() => setSheetSong(null)}
        />
      )}
    </>
  );
}

/** A one-field prompt: new playlist, rename, anything with a name. */
function NameSheet({
  title,
  initialValue,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  initialValue?: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue ?? "");
  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.sheetBackdrop} onPress={onCancel} />
      <View style={styles.sheet}>
        <Text style={styles.sheetTitle}>{title}</Text>
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder="Name"
          placeholderTextColor={colors.textMuted}
          style={styles.nameInput}
          autoFocus
          maxLength={120}
          returnKeyType="done"
          onSubmitEditing={submit}
        />
        <View style={styles.sheetActions}>
          <TouchableOpacity style={styles.sheetGhost} onPress={onCancel}>
            <Text style={styles.sheetGhostText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sheetPrimary}
            onPress={submit}
            disabled={!value.trim()}
          >
            <Text style={styles.sheetPrimaryText}>{confirmLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/** The context menu for a navidrome song, wherever it is listed. */
function songSheetActions(
  song: NavidromeSong,
  creds: NavidromeCredentials,
  art: string | null,
  onOpenArtist?: (artistId: string, name: string) => void,
  onAddToPlaylist?: (songId: string) => void,
  onRemoveFromPlaylist?: () => void,
): SheetAction[] {
  const track = songToQueueTrack(song, creds, art);
  const actions: SheetAction[] = [
    {
      label: "Play next",
      icon: "corner-down-right",
      onPress: () => queueTracks([track], "next"),
    },
    {
      label: "Add to queue (last)",
      icon: "list",
      onPress: () => queueTracks([track], "last"),
    },
  ];
  if (onAddToPlaylist) {
    actions.push({
      label: "Add to playlist…",
      icon: "plus",
      onPress: () => onAddToPlaylist(song.id),
    });
  }
  if (onRemoveFromPlaylist) {
    actions.push({
      label: "Remove from playlist",
      icon: "minus-circle",
      onPress: onRemoveFromPlaylist,
    });
  }
  if (song.artistId && onOpenArtist) {
    const artistId = song.artistId;
    actions.push({
      label: "Go to artist",
      icon: "user",
      onPress: () => onOpenArtist(artistId, song.artist),
    });
  }
  return actions;
}

/**
 * A playlist's tracks.
 *
 * Each row carries its own art, unlike an album's — a playlist is a set of
 * tracks from anywhere, so there is no one cover for them all.
 */
function PlaylistDetailScreen({
  view,
  onBack,
  onAddToPlaylist,
}: {
  view: Extract<DetailView, { kind: "playlist" }>;
  onBack: () => void;
  onAddToPlaylist: (songId: string) => void;
}) {
  const removeTrack = useRemoveTrackFromPlaylistMutation();
  const { data: creds } = useNavidromeCredentials();
  const { data: playlist, isLoading } = useNavidromePlaylistQuery(view.id);
  const [sheetSong, setSheetSong] = useState<NavidromeSong | null>(null);
  const songs: NavidromeSong[] = useMemo(
    () => dedupeById(playlist?.entry ?? []),
    [playlist],
  );
  const queue = useMemo(
    () =>
      creds
        ? songs.map((song) =>
            songToQueueTrack(song, creds, coverArtUrlOf(song)),
          )
        : [],
    [songs, creds],
  );

  return (
    <>
      <FlatList
        data={songs}
        keyExtractor={(song) => song.id}
        renderItem={({ item, index }) => (
          <SongRow
            song={item}
            art={coverArtUrlOf(item)}
            onPress={() => playQueue(queue, index)}
            onMore={() => setSheetSong(item)}
          />
        )}
        ListHeaderComponent={
          <DetailHeader
            title={view.title}
            subtitle={
              playlist
                ? `${songs.length} track${songs.length === 1 ? "" : "s"}`
                : view.subtitle
            }
            art={coverArtUrlOf(playlist) ?? view.art}
            trackArts={playlist?.trackArts ?? view.trackArts ?? null}
            onBack={onBack}
            onPlay={() => playQueue(queue, 0)}
            onShuffle={() => playQueue(shuffled(queue), 0)}
          />
        }
        ListEmptyComponent={
          isLoading ? (
            <ListFooter loading />
          ) : (
            <EmptyState message="This playlist is empty" />
          )
        }
        ListFooterComponent={<View style={{ height: 24 }} />}
        showsVerticalScrollIndicator={false}
      />
      {sheetSong && creds && (
        <TrackActionSheet
          title={sheetSong.title}
          subtitle={sheetSong.artist}
          art={coverArtUrlOf(sheetSong)}
          actions={songSheetActions(
            sheetSong,
            creds,
            coverArtUrlOf(sheetSong),
            undefined,
            onAddToPlaylist,
            () => {
              // By position, which is what the API removes by; the id can
              // legitimately appear twice in one playlist.
              const index = songs.indexOf(sheetSong);
              if (index >= 0) {
                removeTrack.mutate({ playlistId: view.id, index });
              }
            },
          )}
          onClose={() => setSheetSong(null)}
        />
      )}
    </>
  );
}

function PlaylistRow({
  playlist,
  onPress,
  onMore,
}: {
  playlist: NavidromePlaylist;
  onPress: () => void;
  onMore: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.trackRow}
      onPress={onPress}
      onLongPress={onMore}
    >
      <PlaylistCover
        picture={coverArtUrlOf(playlist)}
        trackArts={playlist.trackArts}
        size={44}
      />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {playlist.name}
        </Text>
        <Text numberOfLines={1} style={styles.rowSubtitle}>
          {playlist.songCount} track{playlist.songCount === 1 ? "" : "s"}
        </Text>
      </View>
      <MoreButton onPress={onMore} />
    </TouchableOpacity>
  );
}

function ArtistDetailScreen({
  view,
  onBack,
  onOpenAlbum,
}: {
  view: Extract<DetailView, { kind: "artist" }>;
  onBack: () => void;
  onOpenAlbum: (album: NavidromeAlbum) => void;
}) {
  const { data: creds } = useNavidromeCredentials();
  const { data: artist, isLoading } = useNavidromeArtistQuery(view.id);
  const albums: NavidromeAlbum[] = useMemo(
    () => dedupeById(artist?.album ?? []),
    [artist],
  );
  const art = artist ? artistArtUrlOf(artist) : view.art;

  const play = async (shuffle: boolean) => {
    if (!creds || albums.length === 0) return;
    const tracks = await fetchArtistQueue(albums, creds);
    await playQueue(shuffle ? shuffled(tracks) : tracks, 0);
  };

  return (
    <FlatList
      data={albums}
      keyExtractor={(album) => album.id}
      numColumns={3}
      columnWrapperStyle={{ gap: 10 }}
      renderItem={({ item }) => (
        <AlbumCard album={item} onPress={() => onOpenAlbum(item)} />
      )}
      ListHeaderComponent={
        <DetailHeader
          title={view.name}
          subtitle={`${albums.length} album${albums.length === 1 ? "" : "s"}`}
          art={art}
          round
          fallbackLabel={initialOf(view.name)}
          onBack={onBack}
          onPlay={() => play(false)}
          onShuffle={() => play(true)}
        />
      }
      ListEmptyComponent={
        isLoading ? (
          <ListFooter loading />
        ) : (
          <EmptyState message="No albums here yet" />
        )
      }
      ListFooterComponent={<View style={{ height: 24 }} />}
      showsVerticalScrollIndicator={false}
    />
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function Library() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const signedIn = !!useAtomValue(authTokenAtom);

  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  // A stack, because an album can be opened from inside an artist: back has to
  // return to the artist, not to the tabs.
  const [stack, setStack] = useState<DetailView[]>([]);
  const [sheetTrack, setSheetTrack] = useState<UploadedTrack | null>(null);
  const [sheetSong, setSheetSong] = useState<NavidromeSong | null>(null);
  const [sheetPlaylist, setSheetPlaylist] = useState<NavidromePlaylist | null>(
    null,
  );
  // Which flow is asking for a name, and the song waiting for a playlist.
  const [naming, setNaming] = useState<
    | { kind: "new"; songId?: string }
    | { kind: "rename"; playlist: NavidromePlaylist }
    | null
  >(null);
  const [addingSongId, setAddingSongId] = useState<string | null>(null);
  const renamePlaylistMutation = useRenamePlaylistMutation();
  const deletePlaylistMutation = useDeletePlaylistMutation();

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // All three lists load together rather than on first tab press, like the web
  // client does: the first page of each is in cache by the time a tab is
  // tapped, so switching renders instantly instead of waiting on a request.
  //
  // Albums and artists come from navidrome's Subsonic API — the same calls the
  // web clients make. The /uploads/albums and /uploads/artists endpoints
  // group-by the user's whole upload set per page and took seconds.
  const { data: creds } = useNavidromeCredentials();
  const tracksQuery = useUploadsInfiniteQuery(query, signedIn);
  const albumsQuery = useNavidromeAlbumsInfiniteQuery(query, signedIn);
  const artistsQuery = useNavidromeArtistsQuery(query, signedIn);
  const playlistsQuery = useNavidromePlaylistsQuery(signedIn);
  const favoritesQuery = useNavidromeFavoritesQuery(query, signedIn);

  const tracks: UploadedTrack[] = tracksQuery.data?.pages.flat() ?? [];
  // Pages are offset-based, so a library that changes between requests can
  // repeat a row across pages — deduped here rather than in the query, whose
  // page lengths drive the offsets.
  const albums: NavidromeAlbum[] = useMemo(
    () => dedupeById(albumsQuery.data?.pages.flat() ?? []),
    [albumsQuery.data],
  );
  const artists: NavidromeArtist[] = artistsQuery.data ?? [];
  const playlists: NavidromePlaylist[] = useMemo(() => {
    const all = dedupeById(playlistsQuery.data ?? []);
    const needle = query.trim().toLowerCase();
    // getPlaylists takes no query, so the search filters here rather than
    // leaving this tab unresponsive while the others react.
    return needle
      ? all.filter((playlist) => playlist.name.toLowerCase().includes(needle))
      : all;
  }, [playlistsQuery.data, query]);
  const favorites = favoritesQuery.songs;
  const favoriteQueue = useMemo(
    () =>
      creds
        ? favorites.map((song) =>
            songToQueueTrack(song, creds, coverArtUrlOf(song)),
          )
        : [],
    [favorites, creds],
  );

  const loadMoreTracks = nextPageLoader(tracksQuery);
  const loadMoreAlbums = nextPageLoader(albumsQuery);

  const openAlbum = (album: NavidromeAlbum) =>
    setStack((prev) => [
      ...prev,
      {
        kind: "album",
        id: album.id,
        title: album.name,
        subtitle: album.artist,
        art: coverArtUrlOf(album),
      },
    ]);

  const openArtistById = (artistId: string, name: string) =>
    setStack((prev) => [
      ...prev,
      { kind: "artist", id: artistId, name, art: null },
    ]);

  // An uploaded track knows its artist's name and record URI, but getArtist
  // takes a navidrome id, so the name is matched first.
  const openArtistByName = async (name: string) => {
    if (!creds || !name) return;
    const artistId = await resolveArtistIdByName(creds, name);
    if (!artistId) {
      Alert.alert("Artist not found", `${name} is not in your library.`);
      return;
    }
    openArtistById(artistId, name);
  };

  const openArtist = (artist: NavidromeArtist) =>
    setStack((prev) => [
      ...prev,
      {
        kind: "artist",
        id: artist.id,
        name: artist.name,
        art: artistArtUrlOf(artist),
      },
    ]);

  const uploadSheetActions = (item: UploadedTrack): SheetAction[] => {
    const track = uploadToQueueTrack(item);
    const actions: SheetAction[] = [
      {
        label: "Play next",
        icon: "corner-down-right",
        onPress: () => queueTracks([track], "next"),
      },
      {
        label: "Add to queue (last)",
        icon: "list",
        onPress: () => queueTracks([track], "last"),
      },
    ];
    actions.push({
      label: "Add to playlist…",
      icon: "plus",
      onPress: () => setAddingSongId(item.track.id),
    });
    const { uri, album, albumArtist, albumArt, albumUri, artist } = item.track;
    if (albumUri) {
      // Album and artist stay inside the library, on the navidrome-backed
      // views. getAlbum resolves an AT-URI as well as its own id, so the
      // uploaded track's album opens straight away.
      actions.push({
        label: "Go to album",
        icon: "disc",
        onPress: () =>
          setStack((prev) => [
            ...prev,
            {
              kind: "album",
              id: albumUri,
              title: album,
              subtitle: albumArtist || artist,
              art: albumArt,
            },
          ]),
      });
    }
    actions.push({
      label: "Go to artist",
      icon: "user",
      onPress: () => openArtistByName(albumArtist || artist),
    });
    if (uri) {
      actions.push({
        label: "Track details",
        icon: "music",
        onPress: () => navigation.navigate("SongDetails", { uri }),
      });
    }
    return actions;
  };

  // Playlist writes go through the Rocksky API, which mirrors them to the PDS;
  // a mirror failure means the library changed but the record did not, so it is
  // surfaced rather than swallowed.
  const reportMirror = (error: Error) => {
    if (error instanceof PlaylistMirrorWarning) {
      Alert.alert("Saved, but not published", error.message);
    } else {
      Alert.alert("Could not update playlist", error.message);
    }
  };

  const confirmDeletePlaylist = (playlist: NavidromePlaylist) => {
    Alert.alert(playlist.name, "Delete this playlist?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          deletePlaylistMutation.mutate(playlist.id, {
            onError: reportMirror,
          }),
      },
    ]);
  };

  const playlistSheetActions = (playlist: NavidromePlaylist): SheetAction[] => [
    {
      label: "Rename",
      icon: "edit-2",
      onPress: () => setNaming({ kind: "rename", playlist }),
    },
    {
      label: "Delete playlist",
      icon: "trash-2",
      onPress: () => confirmDeletePlaylist(playlist),
    },
  ];

  const popView = () => setStack((prev) => prev.slice(0, -1));

  // The drill-downs are screen state, not navigator routes, so Android's back
  // button has to be told about them or it would leave the tab instead.
  useEffect(() => {
    if (stack.length === 0) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setStack((prev) => prev.slice(0, -1));
      return true;
    });
    return () => sub.remove();
  }, [stack.length]);

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

  const view = stack[stack.length - 1];
  if (view) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        {view.kind === "album" ? (
          <AlbumDetailScreen
            view={view}
            onBack={popView}
            onOpenArtist={openArtistById}
            onAddToPlaylist={setAddingSongId}
          />
        ) : view.kind === "playlist" ? (
          <PlaylistDetailScreen
            view={view}
            onBack={popView}
            onAddToPlaylist={setAddingSongId}
          />
        ) : (
          <ArtistDetailScreen
            view={view}
            onBack={popView}
            onOpenAlbum={openAlbum}
          />
        )}
        {addingSongId && (
          <AddToPlaylistSheet
            songId={addingSongId}
            onClose={() => setAddingSongId(null)}
          />
        )}
      </SafeAreaView>
    );
  }

  const loadingMore =
    (tab === 0 && tracksQuery.isFetchingNextPage) ||
    (tab === 1 && albumsQuery.isFetchingNextPage);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Library</Text>
        <TouchableOpacity
          style={styles.uploadButton}
          onPress={() => navigation.navigate("Upload")}
        >
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
          placeholder="Search your library"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Sub-tabs. Scrollable: five pills are wider than a phone. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // Without flexGrow 0 a horizontal ScrollView in a column takes all the
        // remaining height, which pushed the lists off the screen.
        style={styles.pillBar}
        contentContainerStyle={styles.pillRow}
      >
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
      </ScrollView>

      {/* Lists */}
      {tab === 0 && (
        <FlatList
          data={tracks}
          keyExtractor={(item) => item.upload.id}
          renderItem={({ item, index }) => (
            <TrackRow
              item={item}
              onPress={() => playUploadedTracks(tracks, index)}
              onMore={() => setSheetTrack(item)}
            />
          )}
          onEndReached={loadMoreTracks}
          onMomentumScrollEnd={loadMoreTracks}
          onEndReachedThreshold={1.2}
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
          keyExtractor={(item) => item.id}
          numColumns={3}
          columnWrapperStyle={{ gap: 10 }}
          renderItem={({ item }) => (
            <AlbumCard album={item} onPress={() => openAlbum(item)} />
          )}
          onEndReached={loadMoreAlbums}
          onMomentumScrollEnd={loadMoreAlbums}
          onEndReachedThreshold={1.2}
          initialNumToRender={9}
          maxToRenderPerBatch={9}
          ListEmptyComponent={
            albumsQuery.isLoading ? (
              <ListFooter loading />
            ) : (
              <EmptyState
                message={
                  query ? "No albums match your search" : "No albums yet"
                }
              />
            )
          }
          ListFooterComponent={<ListFooter loading={loadingMore} />}
          showsVerticalScrollIndicator={false}
        />
      )}
      {tab === 2 && (
        <FlatList
          data={artists}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ArtistRow artist={item} onPress={() => openArtist(item)} />
          )}
          getItemLayout={rowLayout}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={9}
          ListEmptyComponent={
            artistsQuery.isLoading ? (
              <ListFooter loading />
            ) : (
              <EmptyState
                message={
                  query ? "No artists match your search" : "No artists yet"
                }
              />
            )
          }
          ListFooterComponent={<View style={{ height: 24 }} />}
          showsVerticalScrollIndicator={false}
        />
      )}
      {tab === 3 && (
        <FlatList
          data={playlists}
          ListHeaderComponent={
            <TouchableOpacity
              style={styles.newButton}
              onPress={() => setNaming({ kind: "new" })}
            >
              <Feather name="plus" size={14} color={colors.text} />
              <Text style={styles.newButtonText}>New playlist</Text>
            </TouchableOpacity>
          }
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <PlaylistRow
              playlist={item}
              onPress={() =>
                setStack((prev) => [
                  ...prev,
                  {
                    kind: "playlist",
                    id: item.id,
                    title: item.name,
                    subtitle: `${item.songCount} track${item.songCount === 1 ? "" : "s"}`,
                    art: coverArtUrlOf(item),
                    trackArts: item.trackArts,
                  },
                ])
              }
              onMore={() => setSheetPlaylist(item)}
            />
          )}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          ListEmptyComponent={
            playlistsQuery.isLoading ? (
              <ListFooter loading />
            ) : (
              <EmptyState
                message={
                  query ? "No playlists match your search" : "No playlists yet"
                }
              />
            )
          }
          ListFooterComponent={<View style={{ height: 24 }} />}
          showsVerticalScrollIndicator={false}
        />
      )}
      {tab === 4 && (
        <FlatList
          data={favorites}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <SongRow
              song={item}
              art={coverArtUrlOf(item)}
              onPress={() => playQueue(favoriteQueue, index)}
              onMore={() => setSheetSong(item)}
            />
          )}
          getItemLayout={rowLayout}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          ListEmptyComponent={
            favoritesQuery.isLoading ? (
              <ListFooter loading />
            ) : (
              <EmptyState
                message={
                  query
                    ? "No favorites match your search"
                    : "Tracks you love show up here"
                }
              />
            )
          }
          ListFooterComponent={<View style={{ height: 24 }} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      {sheetSong && creds && (
        <TrackActionSheet
          title={sheetSong.title}
          subtitle={sheetSong.artist}
          art={coverArtUrlOf(sheetSong)}
          actions={songSheetActions(
            sheetSong,
            creds,
            coverArtUrlOf(sheetSong),
            openArtistById,
            setAddingSongId,
          )}
          onClose={() => setSheetSong(null)}
        />
      )}

      {sheetPlaylist && (
        <TrackActionSheet
          title={sheetPlaylist.name}
          subtitle={`${sheetPlaylist.songCount} track${sheetPlaylist.songCount === 1 ? "" : "s"}`}
          art={coverArtUrlOf(sheetPlaylist)}
          actions={playlistSheetActions(sheetPlaylist)}
          onClose={() => setSheetPlaylist(null)}
        />
      )}

      {naming?.kind === "new" && (
        <NewPlaylistSheet
          seedSongId={naming.songId}
          onClose={() => setNaming(null)}
        />
      )}
      {naming?.kind === "rename" && (
        <NameSheet
          title="Rename playlist"
          initialValue={naming.playlist.name}
          confirmLabel="Rename"
          onCancel={() => setNaming(null)}
          onConfirm={(name) => {
            renamePlaylistMutation.mutate(
              { playlistId: naming.playlist.id, name },
              { onSuccess: () => setNaming(null), onError: reportMirror },
            );
          }}
        />
      )}
      {addingSongId && (
        <AddToPlaylistSheet
          songId={addingSongId}
          onClose={() => setAddingSongId(null)}
        />
      )}

      {sheetTrack && (
        <TrackActionSheet
          title={sheetTrack.track.title}
          subtitle={sheetTrack.track.artist}
          art={sheetTrack.track.albumArt}
          actions={uploadSheetActions(sheetTrack)}
          onClose={() => setSheetTrack(null)}
        />
      )}
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
  pillBar: {
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: 12,
  },
  pillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  // 44 tall so an album's rows keep the same height as a cover-art row and
  // getItemLayout stays accurate.
  trackNumberCell: {
    width: 28,
    height: 44,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  trackNumber: {
    fontSize: 13,
    color: colors.textMuted,
    fontVariant: ["tabular-nums"],
  },
  moreButton: {
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 28,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 12,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
  },
  sheetItemText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 12,
  },
  nameInput: {
    backgroundColor: colors.inputBackground,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  sheetActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 14,
  },
  sheetGhost: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: colors.surface2,
  },
  sheetGhostText: {
    fontSize: 13,
    color: colors.text,
  },
  sheetPrimary: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: colors.primary,
  },
  sheetPrimaryText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  pickerList: {
    maxHeight: 320,
  },
  newButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    marginBottom: 6,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  newButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
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
