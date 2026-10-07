import { MoreButton, MenuAction, libraryActionStyles } from "./LibraryActions";
import { libraryStyles } from "./LibraryStyles";
import PlaylistCover from "../../components/PlaylistCover";
import LibraryList from "./LibraryList";
import type { ReactNode } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAtomValue } from "jotai";
import { authTokenAtom } from "../../atoms/auth";
import type { RootStackParamList } from "../../Navigation";
import { storage } from "../../storage";
import { enqueueUploads } from "../../lib/uploadQueue";
import {
  localUploadDisabledReason,
  localUploadFiles,
} from "../../lib/deviceMusicUpload";
import Feather from "@expo/vector-icons/Feather";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { localMusicNative } from "../../../modules/rocksky-engine";
import { Text } from "../../components/Text";
import {
  deviceQueueTrack,
  readDeviceLibrary,
  scanDeviceMusic,
  type DeviceTrack,
  type DevicePlaylist,
} from "../../lib/deviceMusic";
import {
  identifyDeviceTrack,
  identifyDeviceTracks,
  enrichMetadataSuggestion,
  type TrackIdentificationResult,
  type MetadataSuggestion,
} from "../../lib/deviceMusicIdentification";
import { playQueue, queueTracks } from "../../lib/libraryPlayback";
import {
  refreshDeviceQueueTracks,
  refreshLocalLikeState,
} from "../../lib/uploadEngine";
import { colors } from "../../theme";

const tabs = ["Tracks", "Albums", "Artists", "Playlists", "Favorites"] as const;
type Tab = (typeof tabs)[number];
const fields = [
  "title",
  "artist",
  "album",
  "albumArtist",
  "genre",
  "year",
  "trackNumber",
  "discNumber",
] as const;
const labels = {
  title: "Title",
  artist: "Artist",
  album: "Album",
  albumArtist: "Album artist",
  genre: "Genre",
  year: "Year",
  trackNumber: "Track number",
  discNumber: "Disc number",
};

function Button({
  text,
  icon,
  onPress,
  disabled = false,
}: {
  text: string;
  icon?: React.ComponentProps<typeof Feather>["name"];
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && { opacity: 0.45 }]}
    >
      {icon && <Feather name={icon} size={17} color={colors.text} />}
      <Text style={styles.buttonText}>{text}</Text>
    </Pressable>
  );
}

function IconButton({
  label,
  icon,
  onPress,
  disabled = false,
}: {
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.iconButton, disabled && { opacity: 0.45 }]}
    >
      <Feather name={icon} size={24} color={colors.text} />
    </Pressable>
  );
}

function MetadataEditor({
  track,
  close,
  save,
  initialCandidates = [],
  initialError = "",
}: {
  track: DeviceTrack;
  close: () => void;
  save: (metadata: Record<string, unknown>) => Promise<void>;
  initialCandidates?: MetadataSuggestion[];
  initialError?: string;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((key) => [key, String(track[key] ?? "")])),
  );
  const [mbId, setMbId] = useState(track.mbId ?? "");
  const [search, setSearch] = useState(
    [track.title, track.artist].filter(Boolean).join(" "),
  );
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] =
    useState<MetadataSuggestion[]>(initialCandidates);
  const [message, setMessage] = useState(initialError);
  const [albumArt, setAlbumArt] = useState<string | null>(
    track.albumArt ?? null,
  );
  const applySuggestion = async (candidate: MetadataSuggestion) => {
    setBusy(true);
    try {
      const enriched = await enrichMetadataSuggestion(candidate);
      setDraft((previous) => ({
        ...previous,
        title: enriched.title,
        artist: enriched.artist,
        album: enriched.album,
        albumArtist: enriched.albumArtist,
        ...(enriched.genre ? { genre: enriched.genre } : {}),
        ...Object.fromEntries(
          (["year", "trackNumber", "discNumber"] as const)
            .filter((key) => enriched[key])
            .map((key) => [key, String(enriched[key])]),
        ),
      }));
      setMbId(enriched.mbId);
      if (enriched.albumArt) setAlbumArt(enriched.albumArt);
      setCandidates([]);
      setMessage(
        `${enriched.enrichmentWarning ?? "Suggestion selected."} Review the fields and cover before saving.`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const identify = async (method: "fingerprint" | "search") => {
    setBusy(true);
    setMessage("");
    setCandidates([]);
    try {
      const matches = await identifyDeviceTrack(track, method, search);
      setCandidates(matches);
      if (!matches.length)
        setMessage(
          "No matches found. Try searching by title and artist, or edit the fields below.",
        );
    } catch (e) {
      setMessage(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    setBusy(true);
    try {
      const metadata: Record<string, unknown> = {
        mbId,
        ...(albumArt !== (track.albumArt ?? null) ? { albumArt } : {}),
      };
      for (const key of fields) {
        if (["year", "trackNumber", "discNumber"].includes(key)) {
          const value = draft[key].trim();
          if (value && (!/^\d+$/.test(value) || Number(value) <= 0))
            throw new Error(`${labels[key]} must be a positive whole number.`);
          metadata[key] = value ? Number(value) : null;
        } else metadata[key] = draft[key].trim();
      }
      await save(metadata);
      close();
    } catch (e) {
      setMessage(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={() => {
        if (!busy) close();
      }}
    >
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.editor}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>Edit track metadata</Text>
        <Text style={styles.muted}>{track.filename}</Text>
        <Text style={styles.muted}>
          Changes stay in your local library. Incomplete tracks play without
          scrobbling.
        </Text>
        <Button
          text={busy ? "Working…" : "Identify this track with audio"}
          icon="music"
          onPress={() => void identify("fingerprint")}
          disabled={busy}
        />
        <Text style={styles.muted}>
          Looks up this track’s fingerprint with AcoustID. Your audio file is
          not uploaded.
        </Text>
        <TextInput
          accessibilityLabel="MusicBrainz search"
          placeholder="Search title and artist"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={search}
          onChangeText={setSearch}
        />
        <Button
          text="Search MusicBrainz"
          icon="search"
          onPress={() => void identify("search")}
          disabled={busy}
        />
        <Button
          text="Find cover & extra metadata"
          icon="image"
          disabled={busy}
          onPress={() =>
            void applySuggestion({
              title: draft.title,
              artist: draft.artist,
              album: draft.album,
              albumArtist: draft.albumArtist,
              mbId,
              source: "Rocksky",
            })
          }
        />
        {albumArt && (
          <View style={{ gap: 8, alignItems: "center" }}>
            <Image
              source={{ uri: albumArt }}
              style={{ width: 180, height: 180, borderRadius: 12 }}
            />
            <Button
              text="Remove cover"
              disabled={busy}
              onPress={() => setAlbumArt(null)}
            />
          </View>
        )}
        {busy && <ActivityIndicator color={colors.primary} />}
        {!!message && <Text style={styles.muted}>{message}</Text>}
        {candidates.length > 0 && (
          <Text style={styles.muted}>
            Choose a suggestion, review the fields, then save.
          </Text>
        )}
        {candidates.map((candidate, index) => (
          <Pressable
            key={`${candidate.mbId}-${index}`}
            style={styles.candidate}
            disabled={busy}
            onPress={() => void applySuggestion(candidate)}
          >
            <Text>{candidate.title}</Text>
            <Text style={styles.muted}>
              {candidate.artist} · {candidate.album || "No release"}
            </Text>
            <Text style={styles.muted}>
              {candidate.source}
              {candidate.year ? ` · ${candidate.year}` : ""}
            </Text>
          </Pressable>
        ))}
        {fields.map((field) => (
          <View key={field} style={{ gap: 6 }}>
            <Text>{labels[field]}</Text>
            <TextInput
              accessibilityLabel={labels[field]}
              style={styles.input}
              value={draft[field]}
              editable={!busy}
              onChangeText={(value) =>
                setDraft((previous) => ({ ...previous, [field]: value }))
              }
              keyboardType={
                ["year", "trackNumber", "discNumber"].includes(field)
                  ? "number-pad"
                  : "default"
              }
            />
          </View>
        ))}
        <View style={styles.row}>
          <Button text="Cancel" onPress={close} disabled={busy} />
          <Button
            text="Save metadata"
            icon="check"
            onPress={() => void confirm()}
            disabled={busy}
          />
        </View>
      </ScrollView>
    </Modal>
  );
}

export default function DeviceLibrary({
  album,
  sourceSwitcher,
}: {
  album?: RootStackParamList["LocalAlbumDetails"];
  sourceSwitcher?: ReactNode;
}) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const signedIn = !!useAtomValue(authTokenAtom);
  const [albumActions, setAlbumActions] = useState<{
    title: string;
    ids: string[];
  } | null>(null);
  const library = useQuery({
    queryKey: ["device-library"],
    queryFn: readDeviceLibrary,
    refetchInterval: (query) =>
      ["pending", "scanning"].includes(query.state.data?.scan.state ?? "")
        ? 1500
        : 15000,
  });
  const [tab, setTab] = useState<Tab>(album ? "Albums" : "Tracks");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<{
    title: string;
    ids: string[];
    playlist?: DevicePlaylist;
  } | null>(album ?? null);
  const [actions, setActions] = useState<DeviceTrack | null>(null);
  const [editing, setEditing] = useState<DeviceTrack | null>(null);
  const [adding, setAdding] = useState<DeviceTrack | null>(null);
  const [naming, setNaming] = useState<{ id?: string; name: string } | null>(
    null,
  );
  const [working, setWorking] = useState(false);
  const [requestingScan, setRequestingScan] = useState(false);
  const scanRequestPending = useRef(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [batch, setBatch] = useState<{
    running: boolean;
    total: number;
    completed: number;
    current: string;
    results: TrackIdentificationResult[];
    message?: string;
  }>({ running: false, total: 0, completed: 0, current: "", results: [] });
  const batchController = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const [reviewing, setReviewing] = useState<TrackIdentificationResult | null>(
    null,
  );
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      batchController.current?.abort();
    };
  }, []);
  const tracks = library.data?.tracks ?? [];
  const playlists = library.data?.playlists ?? [];
  const scanning = ["pending", "scanning"].includes(
    library.data?.scan.state ?? "",
  );
  const run = async (action: () => Promise<unknown>) => {
    if (working) return;
    setWorking(true);
    try {
      await action();
      await library.refetch();
      refreshLocalLikeState();
    } catch (e) {
      Alert.alert("Local music", e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };
  const rescan = async () => {
    if (working || scanRequestPending.current) return;
    scanRequestPending.current = true;
    setRequestingScan(true);
    try {
      await run(scanDeviceMusic);
    } finally {
      scanRequestPending.current = false;
      if (mounted.current) setRequestingScan(false);
    }
  };
  const refreshControl = () => (
    <RefreshControl
      refreshing={requestingScan || scanning}
      onRefresh={() => void rescan()}
      colors={[colors.primary]}
      tintColor={colors.primary}
      progressBackgroundColor={colors.surface2}
    />
  );
  const uploadIds = albumActions?.ids ?? (actions ? [actions.id] : []);
  const uploadTracks = tracks.filter((track) => uploadIds.includes(track.id));
  const uploadReason =
    uploadTracks.length !== uploadIds.length
      ? "Some tracks are no longer available."
      : localUploadDisabledReason(uploadTracks);
  const uploadLocal = () => {
    if (!storage.getDid() || !storage.getToken()) {
      setActions(null);
      setAlbumActions(null);
      navigation.navigate("SignIn");
      return;
    }
    void run(async () => {
      const owner = storage.getDid();
      const session = storage.getToken();
      if (!owner || !session) throw new Error("Sign in to upload music.");
      const fresh = await readDeviceLibrary();
      const chosen = fresh.tracks.filter((track) =>
        uploadIds.includes(track.id),
      );
      if (chosen.length !== uploadIds.length)
        throw new Error("Some tracks are no longer available.");
      const files = localUploadFiles(chosen);
      if (owner !== storage.getDid() || session !== storage.getToken())
        throw new Error("Sign in to upload music.");
      enqueueUploads(files);
      setActions(null);
      setAlbumActions(null);
      navigation.navigate("Upload");
    });
  };
  const mutate = async (input: Record<string, unknown>) => {
    await localMusicNative.mutate(input);
    const result = await library.refetch();
    if (result.data) refreshDeviceQueueTracks(result.data.tracks);
  };
  const toggleSelected = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const startIdentification = async () => {
    if (batchController.current) return;
    const chosen = tracks.filter((track) => selected.has(track.id));
    if (!chosen.length) return;
    const controller = new AbortController();
    batchController.current = controller;
    setReviewed(new Set());
    setBatchOpen(true);
    setBatch({
      running: true,
      total: chosen.length,
      completed: 0,
      current: "",
      results: [],
    });
    try {
      await identifyDeviceTracks(chosen, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (!mounted.current) return;
          setBatch((previous) => ({
            ...previous,
            total: progress.total,
            completed: progress.completed,
            current: progress.current
              ? progress.current.title || progress.current.filename
              : "",
            results: progress.result
              ? [...previous.results, progress.result]
              : previous.results,
          }));
        },
      });
    } catch (e) {
      if (mounted.current)
        setBatch((previous) => ({
          ...previous,
          message: controller.signal.aborted
            ? "Stopped. Completed results are available below."
            : e instanceof Error
              ? e.message
              : String(e),
        }));
    } finally {
      batchController.current = null;
      if (mounted.current)
        setBatch((previous) => ({ ...previous, running: false, current: "" }));
    }
  };
  const visible = useMemo(() => {
    const ids = detail?.playlist
      ? (playlists.find((p) => p.id === detail.playlist?.id)?.trackIds ?? [])
      : detail?.ids;
    const selected = ids
      ? ids
          .map((id) => tracks.find((t) => t.id === id))
          .filter((t): t is DeviceTrack => !!t)
      : tracks;
    if (album) {
      selected.sort(
        (a, b) =>
          (a.discNumber || 1) - (b.discNumber || 1) ||
          (a.trackNumber || Number.MAX_SAFE_INTEGER) -
            (b.trackNumber || Number.MAX_SAFE_INTEGER) ||
          (a.title || a.filename).localeCompare(b.title || b.filename),
      );
    }
    return selected.filter(
      (t) =>
        (detail || tab !== "Favorites" || t.favorite) &&
        `${t.title ?? t.filename} ${t.artist ?? ""} ${t.album ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
  }, [tracks, playlists, detail, tab, search, album]);
  const groups = useMemo(() => {
    const grouped = new Map<
      string,
      { title: string; subtitle: string; ids: string[]; art?: string | null }
    >();
    for (const track of tracks) {
      const title =
        tab === "Artists"
          ? track.artist || "Unknown artist"
          : track.album || "Unknown album";
      const subtitle =
        tab === "Artists"
          ? ""
          : track.albumArtist || track.artist || "Unknown artist";
      const key = JSON.stringify([title, subtitle]);
      const group = grouped.get(key) ?? {
        title,
        subtitle,
        ids: [],
        art: track.albumArt,
      };
      group.art ||= track.albumArt;
      group.ids.push(track.id);
      grouped.set(key, group);
    }
    return [...grouped.values()]
      .filter((g) =>
        `${g.title} ${g.subtitle}`.toLowerCase().includes(search.toLowerCase()),
      )
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [tracks, tab, search]);
  const play = (list: DeviceTrack[], index = 0) =>
    void run(() => playQueue(list.map(deviceQueueTrack), index));
  const shuffle = () => {
    const shuffled = [...visible];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    play(shuffled);
  };
  const queue = (track: DeviceTrack, where: "next" | "last") => {
    setActions(null);
    void run(() => queueTracks([deviceQueueTrack(track)], where));
  };
  const libraryHeader = (
    <>
      {sourceSwitcher}
      {detail && (
        <View style={styles.header}>
          <IconButton
            label="Back"
            icon="chevron-left"
            onPress={() => (album ? navigation.goBack() : setDetail(null))}
          />
          <Text numberOfLines={1} style={{ flex: 1 }}>
            {detail.title}
          </Text>
          {tab === "Albums" && (
            <MoreButton
              label="Album options"
              onPress={() => setAlbumActions(detail)}
            />
          )}
          {detail.playlist && (
            <Button
              text="Edit"
              onPress={() =>
                setNaming({ id: detail.playlist!.id, name: detail.title })
              }
            />
          )}
        </View>
      )}
      {(batch.running || batch.results.length > 0) && !batchOpen && (
        <Button
          text={
            batch.running
              ? `Identifying music · ${batch.completed}/${batch.total}`
              : "Review identification results"
          }
          icon="check-circle"
          onPress={() => setBatchOpen(true)}
        />
      )}
      {!album && (
        <>
          <View style={styles.header}>
            <Text style={styles.heading}>On this device</Text>
            <IconButton
              label={tracks.length ? "Rescan music" : "Scan music"}
              icon="refresh-cw"
              disabled={working || requestingScan}
              onPress={() => void rescan()}
            />
          </View>
          {scanning && (
            <Text style={styles.status}>
              {library.data?.scan.count ?? 0} files checked · you can keep using
              the app
            </Text>
          )}
          {library.data?.scan.rescanQueued && (
            <Text style={styles.status}>
              A fresh scan will start when this pass finishes.
            </Text>
          )}
          {!!library.data?.scan.error && (
            <Text style={styles.status}>{library.data.scan.error}</Text>
          )}
          {!!library.error && (
            <Text style={styles.status}>{library.error.message}</Text>
          )}
          {library.data && !library.data.scan.permission && (
            <Text style={styles.status}>
              Tap the refresh icon or pull down to allow access to music on your
              phone.
            </Text>
          )}
        </>
      )}
    </>
  );
  const pinnedControls = !album ? (
    <View>
      <View style={[libraryStyles.searchBox, { marginHorizontal: 16 }]}>
        <Feather name="search" size={14} color={colors.textMuted} />
        <TextInput
          accessibilityLabel="Search local library"
          style={libraryStyles.searchInput}
          placeholder="Search your library"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[libraryStyles.pillBar, { marginHorizontal: 16 }]}
        contentContainerStyle={libraryStyles.pillRow}
      >
        {tabs.map((item) => (
          <Pressable
            key={item}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === item }}
            style={[
              libraryStyles.pill,
              tab === item && libraryStyles.pillActive,
            ]}
            onPress={() => {
              setTab(item);
              setDetail(null);
              setSearch("");
            }}
          >
            <Text
              numberOfLines={1}
              style={[
                libraryStyles.pillText,
                tab === item && libraryStyles.pillTextActive,
              ]}
            >
              {item}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  ) : null;
  return (
    <View style={styles.screen}>
      {tab === "Playlists" && !detail ? (
        <>
          <LibraryList
            header={libraryHeader}
            tabs={pinnedControls}
            ListHeaderComponent={
              <Pressable
                style={[libraryStyles.newButton, { marginHorizontal: 16 }]}
                onPress={() => setNaming({ name: "" })}
              >
                <Feather name="plus" size={14} color={colors.text} />
                <Text style={libraryStyles.newButtonText}>New playlist</Text>
              </Pressable>
            }
            refreshControl={refreshControl()}
            alwaysBounceVertical
            data={playlists.filter((p) =>
              p.name.toLowerCase().includes(search.toLowerCase()),
            )}
            keyExtractor={(p) => p.id}
            renderItem={({ item }) => (
              <Pressable
                style={styles.track}
                onLongPress={() => setNaming({ id: item.id, name: item.name })}
                onPress={() => {
                  setDetail({
                    title: item.name,
                    ids: item.trackIds,
                    playlist: item,
                  });
                  setSearch("");
                }}
              >
                <PlaylistCover
                  size={44}
                  trackArts={item.trackIds
                    .map(
                      (id) => tracks.find((track) => track.id === id)?.albumArt,
                    )
                    .filter((art): art is string => !!art)
                    .slice(0, 4)}
                />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={libraryStyles.rowTitle}>
                    {item.name}
                  </Text>
                  <Text numberOfLines={1} style={libraryStyles.rowSubtitle}>
                    {item.trackIds.length} track
                    {item.trackIds.length === 1 ? "" : "s"}
                  </Text>
                </View>
                <MoreButton
                  label="Playlist options"
                  onPress={() => setNaming({ id: item.id, name: item.name })}
                />
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={styles.empty}>
                Create a playlist, then add tracks from their ⋯ menu.
              </Text>
            }
          />
        </>
      ) : !detail && (tab === "Albums" || tab === "Artists") ? (
        <LibraryList
          header={libraryHeader}
          tabs={pinnedControls}
          refreshControl={refreshControl()}
          alwaysBounceVertical
          data={groups}
          numColumns={tab === "Albums" ? 3 : 1}
          columnWrapperStyle={{ gap: 10, paddingHorizontal: 16 }}
          keyExtractor={(g) => JSON.stringify([g.title, g.subtitle])}
          renderItem={({ item }) =>
            tab === "Albums" ? (
              <Pressable
                style={libraryStyles.albumCard}
                onLongPress={() => setAlbumActions(item)}
                onPress={() => navigation.navigate("LocalAlbumDetails", item)}
              >
                <View style={libraryStyles.albumArtBox}>
                  {item.art ? (
                    <Image
                      source={{ uri: item.art }}
                      style={libraryStyles.albumArt}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={libraryStyles.albumArtFallback}>
                      <Text style={{ opacity: 0.2, fontSize: 22 }}>♪</Text>
                    </View>
                  )}
                </View>
                <Text numberOfLines={1} style={libraryStyles.albumTitle}>
                  {item.title}
                </Text>
                <Text numberOfLines={1} style={libraryStyles.rowSubtitle}>
                  {item.subtitle}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.track}
                onPress={() => {
                  setDetail(item);
                  setSearch("");
                }}
              >
                <Artwork uri={item.art} size={44} round />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={libraryStyles.rowTitle}>
                    {item.title}
                  </Text>
                  <Text numberOfLines={1} style={libraryStyles.rowSubtitle}>
                    {item.ids.length} tracks
                  </Text>
                </View>
                <Feather
                  name="chevron-right"
                  size={18}
                  color={colors.textMuted}
                />
              </Pressable>
            )
          }
        />
      ) : (
        <>
          <LibraryList
            header={libraryHeader}
            tabs={pinnedControls}
            refreshControl={refreshControl()}
            alwaysBounceVertical
            data={visible}
            ListHeaderComponent={
              <>
                {album ? (
                  <View style={styles.albumHeader}>
                    {visible.find((track) => track.albumArt)?.albumArt ? (
                      <Image
                        source={{
                          uri: visible.find((track) => track.albumArt)!
                            .albumArt!,
                        }}
                        style={styles.albumArt}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={[styles.albumArt, styles.albumPlaceholder]}>
                        <Feather
                          name="disc"
                          size={64}
                          color={colors.textMuted}
                        />
                      </View>
                    )}
                    <Text style={styles.heading} numberOfLines={2}>
                      {album.title}
                    </Text>
                    <Text style={styles.muted} numberOfLines={2}>
                      {album.subtitle}
                    </Text>
                    {!!library.error && (
                      <Text style={styles.muted}>{library.error.message}</Text>
                    )}
                  </View>
                ) : null}
                {visible.length > 0 && (
                  <View style={styles.header}>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <IconButton
                        label="Play all"
                        icon="play"
                        disabled={working}
                        onPress={() => play(visible)}
                      />
                      <IconButton
                        label="Shuffle all"
                        icon="shuffle"
                        disabled={working}
                        onPress={shuffle}
                      />
                    </View>
                    <Text style={styles.muted}>{visible.length} tracks</Text>
                  </View>
                )}
                {selecting && (
                  <View style={{ paddingHorizontal: 16, gap: 6 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text style={styles.muted}>{selected.size} selected</Text>
                      <Button
                        text="Done"
                        onPress={() => {
                          setSelecting(false);
                          setSelected(new Set());
                        }}
                      />
                    </View>
                    <View style={styles.row}>
                      <Button
                        text="Select visible"
                        onPress={() =>
                          setSelected(new Set(visible.map((track) => track.id)))
                        }
                      />
                      <Button
                        text="Identify selected"
                        icon="search"
                        disabled={!selected.size || batch.running}
                        onPress={() => void startIdentification()}
                      />
                    </View>
                  </View>
                )}
              </>
            }
            extraData={selected}
            keyExtractor={(t) => t.id}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {library.isLoading
                  ? "Loading music…"
                  : album
                    ? "No tracks from this album are available on this device."
                    : tab === "Favorites"
                      ? "Favorite tracks using the heart or track menu."
                      : "No music here yet. Scan your device to build your local library."}
              </Text>
            }
            renderItem={({ item, index }) => (
              <Pressable
                style={styles.track}
                accessibilityRole={selecting ? "checkbox" : "button"}
                accessibilityState={
                  selecting ? { checked: selected.has(item.id) } : undefined
                }
                accessibilityHint={
                  selecting
                    ? "Toggle track selection"
                    : "Long press to select this track"
                }
                onPress={() =>
                  selecting ? toggleSelected(item.id) : play(visible, index)
                }
                onLongPress={() => {
                  setSelecting(true);
                  setSelected((previous) => new Set(previous).add(item.id));
                }}
              >
                {selecting && (
                  <Feather
                    name={selected.has(item.id) ? "check-square" : "square"}
                    size={22}
                    color={
                      selected.has(item.id) ? colors.primary : colors.textMuted
                    }
                  />
                )}
                <Artwork uri={item.albumArt} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text numberOfLines={1} style={libraryStyles.rowTitle}>
                    {item.title || item.filename}
                  </Text>
                  <Text numberOfLines={1} style={libraryStyles.rowSubtitle}>
                    {item.artist || "Unknown artist"}
                  </Text>
                </View>
                <MoreButton
                  label={`Options for ${item.title || item.filename}`}
                  onPress={() => setActions(item)}
                />
              </Pressable>
            )}
          />
        </>
      )}
      <Modal
        visible={!!actions || !!albumActions || !!adding || !!naming}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setActions(null);
          setAdding(null);
          setNaming(null);
          setAlbumActions(null);
        }}
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Close menu"
            onPress={() => {
              setActions(null);
              setAlbumActions(null);
              setAdding(null);
              setNaming(null);
            }}
          />
          <View style={styles.sheet}>
            <ScrollView keyboardShouldPersistTaps="handled">
              {actions && (
                <View style={{ gap: 0 }}>
                  <View style={libraryActionStyles.sheetHeader}>
                    <Artwork uri={actions.albumArt} size={44} />
                    <View style={{ flex: 1 }}>
                      <Text
                        numberOfLines={1}
                        style={{ fontSize: 13, fontWeight: "500" }}
                      >
                        {actions.title || actions.filename}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={{ fontSize: 11, color: colors.textMuted }}
                      >
                        {actions.artist || "Unknown artist"}
                      </Text>
                    </View>
                  </View>
                  <MenuAction
                    text="Play next"
                    icon="skip-forward"
                    onPress={() => queue(actions, "next")}
                  />
                  <MenuAction
                    text="Add to queue"
                    icon="list"
                    onPress={() => queue(actions, "last")}
                  />
                  <MenuAction
                    text={
                      actions.favorite
                        ? "Remove from local favorites"
                        : "Add to local favorites"
                    }
                    icon="heart"
                    onPress={() => {
                      const t = actions;
                      setActions(null);
                      void run(() =>
                        mutate({
                          action: "favorite",
                          id: t.id,
                          favorite: !t.favorite,
                        }),
                      );
                    }}
                  />
                  <MenuAction
                    text="Add to local playlist"
                    icon="plus"
                    onPress={() => {
                      setAdding(actions);
                      setActions(null);
                    }}
                  />
                  {detail?.playlist && (
                    <MenuAction
                      text="Remove from playlist"
                      icon="minus"
                      onPress={() => {
                        const t = actions;
                        setActions(null);
                        void run(() =>
                          mutate({
                            action: "removeFromPlaylist",
                            id: t.id,
                            playlistId: detail.playlist!.id,
                          }),
                        );
                      }}
                    />
                  )}
                  <MenuAction
                    text="Edit / identify this track"
                    icon="edit-2"
                    onPress={() => {
                      setEditing(actions);
                      setActions(null);
                    }}
                  />
                </View>
              )}
              {(actions || albumActions) && (
                <View style={{ gap: 0 }}>
                  {albumActions && (
                    <View style={libraryActionStyles.sheetHeader}>
                      <Artwork
                        size={44}
                        uri={
                          tracks.find(
                            (track) =>
                              albumActions.ids.includes(track.id) &&
                              track.albumArt,
                          )?.albumArt
                        }
                      />
                      <Text
                        numberOfLines={1}
                        style={{ flex: 1, fontSize: 13, fontWeight: "500" }}
                      >
                        {albumActions.title}
                      </Text>
                    </View>
                  )}
                  <MenuAction
                    text={albumActions ? "Upload album" : "Upload"}
                    icon="upload"
                    disabled={working || (signedIn && !!uploadReason)}
                    onPress={uploadLocal}
                  />
                  {signedIn && uploadReason && (
                    <Text style={styles.muted}>{uploadReason}</Text>
                  )}
                </View>
              )}
              {adding && (
                <View style={{ gap: 0 }}>
                  <Text style={styles.heading}>Add to local playlist</Text>
                  {playlists.map((p) => (
                    <MenuAction
                      key={p.id}
                      text={p.name}
                      onPress={() => {
                        const t = adding;
                        setAdding(null);
                        void run(() =>
                          mutate({
                            action: "addToPlaylist",
                            id: t.id,
                            playlistId: p.id,
                          }),
                        );
                      }}
                    />
                  ))}
                  {!playlists.length && (
                    <Text>Create a playlist in the Playlists tab first.</Text>
                  )}
                </View>
              )}
              {naming && (
                <View style={{ gap: 0 }}>
                  <Text style={styles.heading}>
                    {naming.id ? "Edit playlist" : "New local playlist"}
                  </Text>
                  <TextInput
                    autoFocus
                    accessibilityLabel="Playlist name"
                    style={styles.input}
                    value={naming.name}
                    onChangeText={(name) => setNaming({ ...naming, name })}
                  />
                  <MenuAction
                    text="Save"
                    disabled={!naming.name.trim() || working}
                    onPress={() =>
                      void run(async () => {
                        await mutate({
                          action: naming.id
                            ? "renamePlaylist"
                            : "createPlaylist",
                          ...naming,
                        });
                        if (detail && naming.id)
                          setDetail({ ...detail, title: naming.name.trim() });
                        setNaming(null);
                      })
                    }
                  />
                  {naming.id && (
                    <MenuAction
                      text="Delete playlist"
                      icon="trash-2"
                      onPress={() =>
                        Alert.alert(
                          "Delete local playlist?",
                          "Your audio files will be kept.",
                          [
                            { text: "Cancel" },
                            {
                              text: "Delete",
                              style: "destructive",
                              onPress: () =>
                                void run(async () => {
                                  await mutate({
                                    action: "deletePlaylist",
                                    id: naming.id,
                                  });
                                  setNaming(null);
                                  setDetail(null);
                                }),
                            },
                          ],
                        )
                      }
                    />
                  )}
                </View>
              )}
              <MenuAction
                text="Close"
                onPress={() => {
                  setActions(null);
                  setAdding(null);
                  setNaming(null);
                  setAlbumActions(null);
                }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
      {editing && (
        <MetadataEditor
          key={editing.id}
          track={editing}
          initialCandidates={reviewing?.suggestions}
          initialError={reviewing?.error}
          close={() => {
            setEditing(null);
            if (reviewing) {
              setReviewing(null);
              setBatchOpen(true);
            }
          }}
          save={async (metadata) => {
            await mutate({ action: "edit", id: editing.id, metadata });
            if (reviewing)
              setReviewed((previous) => new Set([...previous, editing.id]));
          }}
        />
      )}
      <Modal
        visible={batchOpen}
        animationType="slide"
        onRequestClose={() => setBatchOpen(false)}
      >
        <View
          style={[
            styles.screen,
            {
              paddingTop: 56,
              paddingHorizontal: 16,
              paddingBottom: 32,
              gap: 12,
            },
          ]}
        >
          <Text style={styles.heading}>Identify selected tracks</Text>
          <Text style={styles.muted}>
            {batch.completed} / {batch.total} completed
          </Text>
          <Text style={styles.muted}>
            Tracks are processed one at a time. Review each match before saving.
          </Text>
          {!!batch.current && <Text numberOfLines={1}>{batch.current}</Text>}
          {!!batch.message && <Text style={styles.muted}>{batch.message}</Text>}
          {batch.running && (
            <>
              <ActivityIndicator color={colors.primary} />
              <Button
                text="Stop identification"
                onPress={() => {
                  batchController.current?.abort();
                  setBatch((previous) => ({
                    ...previous,
                    message:
                      "Stopping… finishing the current local fingerprint if needed.",
                  }));
                }}
              />
            </>
          )}
          <FlatList
            data={batch.results}
            keyExtractor={(item) => item.track.id}
            renderItem={({ item }) => (
              <View style={styles.candidate}>
                <Text numberOfLines={1}>
                  {item.track.title || item.track.filename}
                </Text>
                <Text style={styles.muted}>
                  {reviewed.has(item.track.id)
                    ? "Saved"
                    : item.error ||
                      (item.suggestions.length
                        ? `${item.suggestions.length} suggestions`
                        : "No matches found")}
                </Text>
                <Button
                  text={
                    item.suggestions.length
                      ? "Review matches"
                      : "Edit / search manually"
                  }
                  disabled={batch.running}
                  onPress={() => {
                    setReviewing(item);
                    setEditing(
                      tracks.find((track) => track.id === item.track.id) ??
                        item.track,
                    );
                    setBatchOpen(false);
                  }}
                />
              </View>
            )}
          />
          <Button
            text={batch.running ? "Keep browsing" : "Close"}
            onPress={() => setBatchOpen(false)}
          />
        </View>
      </Modal>
    </View>
  );
}

function Artwork({
  uri,
  size = 44,
  round = false,
}: {
  uri?: string | null;
  size?: number;
  round?: boolean;
}) {
  return uri ? (
    <Image
      source={{ uri }}
      style={[
        styles.art,
        { width: size, height: size, borderRadius: round ? size / 2 : 6 },
      ]}
    />
  ) : (
    <View
      style={[
        styles.art,
        {
          width: size,
          height: size,
          borderRadius: round ? size / 2 : 6,
          alignItems: "center",
          justifyContent: "center",
        },
      ]}
    >
      <Feather name="music" size={22} color={colors.textMuted} />
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  heading: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    flexShrink: 1,
  },
  muted: { color: colors.textMuted, fontSize: 13 },
  status: {
    color: colors.textMuted,
    marginHorizontal: 16,
    marginBottom: 10,
    fontSize: 13,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.surface2,
    padding: 12,
    borderRadius: 12,
    marginVertical: 2,
  },
  buttonText: { color: colors.text, fontSize: 14 },
  albumHeader: {
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 8,
    paddingBottom: 12,
  },
  albumArt: {
    width: 160,
    height: 160,
    borderRadius: 12,
    backgroundColor: colors.surface2,
  },
  albumPlaceholder: { alignItems: "center", justifyContent: "center" },
  iconButton: {
    width: 44,
    height: 44,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    color: colors.text,
    backgroundColor: colors.inputBackground,
    padding: 12,
    borderRadius: 12,
    fontSize: 15,
  },
  row: { flexDirection: "row", gap: 12, justifyContent: "flex-end" },
  track: { ...libraryStyles.trackRow, paddingHorizontal: 16 },
  art: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.surface2,
  },
  empty: { color: colors.textMuted, padding: 24, textAlign: "center" },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  sheet: { ...libraryActionStyles.sheet, maxHeight: "85%" },
  editor: { padding: 20, paddingTop: 60, paddingBottom: 48, gap: 14 },
  candidate: {
    backgroundColor: colors.surface2,
    padding: 12,
    borderRadius: 12,
    gap: 4,
  },
});
