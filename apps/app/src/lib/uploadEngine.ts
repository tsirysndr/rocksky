import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  type EnqueueCommand,
  RemotePlayer,
  type RemoteQueueItem,
} from "@rocksky/sdk/remote";
import Constants from "expo-constants";
import { atom, getDefaultStore } from "jotai";
import { Alert, AppState, Platform } from "react-native";
import {
  type EngineStatus,
  engineCommand as nativeEngineCommand,
  type EngineCommand,
  type EngineAck,
  type EngineError,
  isEngineAvailable,
  localMusicNative,
} from "../../modules/rocksky-engine";
import { getSongLikeState, like, unlike } from "../api/likes";
import {
  fetchStarredSongIds,
  type NavidromeCredentials,
  navidromeStreamUrl,
  resolveNavidromeApiKey,
  starNavidromeSong,
  unstarNavidromeSong,
} from "../api/navidrome";
import { getProfileByDid } from "../api/profile";
import {
  ensureStreamToken,
  getCastStreamUrl,
  getStreamUrl,
  submitScrobble,
} from "../api/uploads";
import { selectedSourceAtom } from "../atoms/devices";
import {
  localEngineActiveAtom,
  nowPlayingAtom,
  playbackLockedUntilAtom,
  playerAtom,
  progressAtom,
} from "../atoms/nowplaying";
import { profileAtom } from "../atoms/profile";
import { storage } from "../storage";
import {
  createLocalPlaybackModes,
  type PlaybackModes,
} from "./localPlaybackModes";
import { queryClient } from "./queryClient";
import { createQueueSnapshotWriter } from "./queueSnapshotWriter";
import { remoteBridge, type TransportAction } from "./remoteBridge";
import { deviceQueueTrack, type DeviceTrack } from "./deviceMusicModel";
import { castPlayback, type CastPathResolver } from "./castPlayback";
import { mapConcurrent } from "./mapConcurrent";

// Local playback of uploads through the native Rust engine: owns the queue
// metadata (the engine only knows URLs), mirrors engine state into the shared
// now-playing atoms, routes transport actions, and scrobbles.

export type UploadQueueTrack = {
  localId?: string;
  scrobbleEligible?: boolean;
  uploadId: string;
  title: string;
  artist: string;
  albumArtist: string;
  album: string;
  albumArt: string | null;
  durationMs: number;
  songUri: string | null;
  albumUri: string | null;
  artistUri: string | null;
  sha256: string;
  /**
   * MusicBrainz id, when the source gives one. A navidrome song carries no
   * AT-URI, so this is the only handle on its Rocksky record — which is what
   * the love state and the like button are keyed on.
   */
  mbId?: string;
  liked?: boolean;
  /** Subsonic song id, when the track came from navidrome. Its like state is
   *  star/unstar on that id, since there is no AT-URI to address. */
  navidromeId?: string;
  /**
   * A ready-to-play URL, for sources that don't go through /uploads/:id/stream
   * — navidrome's ids are not upload ids. Left unset, the URL is built from
   * `uploadId` and a short-lived stream token.
   */
  streamUrl?: string;
  mimeType?: string;
};

// Both transports feed the same queue, controls, persistence and scrobble gate.
function engineCommand(command: { cmd: "status" }): EngineStatus | EngineError;
function engineCommand(
  command: Exclude<EngineCommand, { cmd: "status" }>,
): EngineAck | EngineError;
function engineCommand(
  command: EngineCommand,
): EngineStatus | EngineAck | EngineError {
  if (castPlayback.connected()) return castPlayback.command(command);
  return command.cmd === "status"
    ? nativeEngineCommand(command)
    : nativeEngineCommand(command);
}

/** The native engine and Cast both expose normalized volume (0–1). */
export function getLocalVolume(): number | null {
  const status = engineCommand({ cmd: "status" });
  return status.ok && Number.isFinite(status.volume) ? status.volume : null;
}
export function setLocalVolume(volume: number) {
  if (!Number.isFinite(volume)) return;
  const result = engineCommand({
    cmd: "setVolume",
    volume: Math.max(0, Math.min(1, volume)),
  });
  if (!result.ok) throw new Error(result.error);
}

async function openPlayback(
  tracks: UploadQueueTrack[],
  paths: string[] | CastPathResolver,
  index: number,
  positionMs = 0,
  autoplay = true,
): Promise<EngineAck | EngineError> {
  if (castPlayback.connected()) {
    await castPlayback.load(tracks, paths, index, positionMs, autoplay);
    nativeEngineCommand({ cmd: "pause" });
    return { ok: true };
  }
  if (!Array.isArray(paths))
    return {
      ok: false,
      error: "Chromecast disconnected while preparing music.",
    };
  return nativeEngineCommand({ cmd: "open", paths, startIndex: index });
}

/** Mounted once by NowPlayingProvider. Cast session events never broadcast remote commands. */
export function startCastPlayback() {
  return castPlayback.start(
    async (resumed) => {
      if (queue.length === 0) await restoreLocalQueue();
      const index = Math.min(
        castPlayback.status().index ?? lastIndex ?? resumeIndex,
        Math.max(0, queue.length - 1),
      );
      const position = resumed
        ? castPlayback.status().positionMs
        : store.get(progressAtom);
      const playing = resumed
        ? castPlayback.status().state === "playing"
        : (store.get(nowPlayingAtom)?.isPlaying ?? false);
      store.set(selectedSourceAtom, { kind: "cast" });
      nativeEngineCommand({ cmd: "pause" });
      if (queue.length > 0) {
        if (!resumed || !castPlayback.hasLoadedQueue())
          await openPlayback(
            queue,
            await playbackPaths(queue),
            index,
            position,
            playing,
          );
        resumePending = false;
        if (lastIndex !== index) lastTrack = null;
        lastIndex = index;
        openedAt = Date.now();
        sawPlaying = false;
        activate();
        pollOnce();
      } else {
        store.set(nowPlayingAtom, null);
        store.set(playerAtom, null);
        store.set(localEngineActiveAtom, true);
      }
    },
    () => {
      const previous = castPlayback.status();
      resumeIndex = previous.index ?? lastIndex ?? 0;
      resumePositionMs = previous.positionMs;
      resumePending = queue.length > 0;
      resumeWantsPlay = false;
      if (store.get(selectedSourceAtom)?.kind === "cast") {
        store.set(selectedSourceAtom, { kind: "local" });
        store.set(playerAtom, queue.length ? "local" : null);
        store.set(nowPlayingAtom, (value) =>
          value ? { ...value, isPlaying: false } : null,
        );
        // A disconnect leaves the phone paused; never start a second audio source automatically.
        if (queue.length) activate();
        else store.set(localEngineActiveAtom, false);
      } else {
        deactivate();
      }
      notifyQueue();
      void saveQueueSnapshot();
    },
  );
}

const MIN_TRACK_MS = 30_000;
const MAX_SCROBBLE_THRESHOLD_MS = 4 * 60_000;

const store = getDefaultStore();

export const localQueueRevisionAtom = atom(0);
const notifyQueue = () =>
  store.set(localQueueRevisionAtom, (value) => value + 1);

/** A local edit immediately changes scrobble eligibility, including queued copies. */
export function refreshDeviceQueueTracks(tracks: DeviceTrack[]) {
  const updates = new Map(tracks.map((track) => [track.id, track]));
  for (const track of queue) {
    const update = track.localId ? updates.get(track.localId) : undefined;
    if (update) Object.assign(track, deviceQueueTrack(update));
  }
  notifyQueue();
  scheduleQueueSave();
  if (lastTrack?.localId && engineOwnsDisplay()) {
    store.set(nowPlayingAtom, (previous) =>
      previous
        ? {
            ...previous,
            title: lastTrack!.title,
            artist: lastTrack!.artist,
            album: lastTrack!.album,
            cover: lastTrack!.albumArt ?? "",
            liked: lastTrack!.liked ?? false,
          }
        : previous,
    );
    void resolveLikeState(lastTrack, lastIndex ?? 0);
  }
}
let lastTrack: UploadQueueTrack | null = null;
let pendingSeek: { position: number; until: number } | null = null;
let queue: UploadQueueTrack[] = [];
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastIndex: number | null = null;
let startedAt = Date.now();
let scrobbled = false;
let openedAt = 0;
let sawPlaying = false;
// Love state for the track at `lastIndex`, once the server has answered: null
// while the lookup is still out, so a tick before it lands doesn't claim the
// track is unloved.
let likedResolved: boolean | null = null;
let resolvedUri: string | null = null;
let likeSeq = 0;
let nextLikeRefreshAt = 0;
// Navidrome credentials, published by useNavidromeCredentials: star/unstar is
// the only like path for a navidrome song, and this module is outside React.
let navidromeCreds: NavidromeCredentials | null = null;

/** The user's starred navidrome songs, shared with anything else that asks. */
const STARRED_IDS_KEY = ["navidrome", "starred-ids"] as const;

export function setEngineNavidromeCredentials(creds: NavidromeCredentials) {
  const changed =
    navidromeCreds?.handle !== creds.handle ||
    navidromeCreds?.apiKey !== creds.apiKey;
  navidromeCreds = creds;
  if (changed && lastIndex !== null && queue[lastIndex]) {
    void resolveLikeState(queue[lastIndex], lastIndex);
  }
}

// ─── Queue persistence ───────────────────────────────────────────────────────
//
// The queue lives in this module, so quitting the app used to lose it. It is
// snapshotted to AsyncStorage and restored paused on the next launch; the
// engine is only reopened when the user presses play, exactly like the web
// client's upload player.

const localModes = createLocalPlaybackModes(
  () => AsyncStorage.getItem("local-playback-modes"),
  (raw) => AsyncStorage.setItem("local-playback-modes", raw),
  (modes, patch) => {
    if (patch.shuffle !== undefined)
      engineCommand({ cmd: "setShuffle", enabled: modes.shuffle });
    if (patch.repeat !== undefined)
      engineCommand({ cmd: "setRepeat", mode: modes.repeat });
    if (engineOwnsDisplay())
      store.set(nowPlayingAtom, (track) =>
        track ? { ...track, ...modes } : track,
      );
    advertiseNowPlaying(true);
  },
);

export function setLocalShuffle(enabled: boolean) {
  void localModes.set({ shuffle: enabled }).catch(reportQueueSaveError);
}

export function setLocalRepeat(mode: PlaybackModes["repeat"]) {
  void localModes.set({ repeat: mode }).catch(reportQueueSaveError);
}

async function applyLocalPlaybackModes() {
  await localModes.load();
  const modes = localModes.get();
  engineCommand({ cmd: "setShuffle", enabled: modes.shuffle });
  engineCommand({ cmd: "setRepeat", mode: modes.repeat });
}

const QUEUE_KEY = "local-queue";
const SAVE_INTERVAL_MS = 1500;

type PersistedQueue = {
  tracks: UploadQueueTrack[];
  index: number;
  positionMs: number;
};

// True once a restored queue is loaded but the engine has not been opened for
// it yet: polling has to stay quiet, or the empty engine looks like a queue
// that just ended and the restored track is wiped.
let resumePending = false;
let resumeInFlight = false;
let resumeWantsPlay = true;
let resumeIndex = 0;
let resumePositionMs = 0;

const reportQueueSaveError = (error: unknown) =>
  console.warn("Could not persist the local playback queue", error);

const queueWriter = createQueueSnapshotWriter<PersistedQueue | null>(
  () =>
    queue.length === 0
      ? null
      : {
          // Never persist credentialed or short-lived stream URLs.
          tracks: queue.map(({ streamUrl: _streamUrl, ...track }) => track),
          index: lastIndex ?? resumeIndex,
          positionMs: resumePositionMs,
        },
  async (snapshot) => {
    if (snapshot)
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(snapshot));
    else await AsyncStorage.removeItem(QUEUE_KEY);
  },
  SAVE_INTERVAL_MS,
);

function scheduleQueueSave() {
  queueWriter.schedule(reportQueueSaveError);
}

async function saveQueueSnapshot() {
  try {
    await queueWriter.flush();
  } catch (error) {
    reportQueueSaveError(error);
  }
}

AppState.addEventListener("change", (state) => {
  if (state !== "active" && queue.length > 0) void saveQueueSnapshot();
});

/**
 * Bring back the queue the app was last playing, paused.
 *
 * Only the metadata and the saved position are restored; the engine stays
 * closed until play is pressed, so a cold start makes no sound. The atoms are
 * claimed only when no other source has, so a restored queue never elbows out
 * a remote device or Spotify.
 */
export async function restoreLocalQueue(): Promise<boolean> {
  const session = storage.getToken();
  if (!isEngineAvailable() || queue.length > 0) return false;
  await localModes.load().catch(reportQueueSaveError);
  let snapshot: PersistedQueue | null = null;
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    snapshot = raw ? (JSON.parse(raw) as PersistedQueue) : null;
  } catch {
    return false;
  }
  if (
    storage.getToken() !== session ||
    !snapshot?.tracks?.length ||
    (!session && snapshot.tracks.some((track) => !track.localId)) ||
    queue.length > 0
  )
    return false;

  const nativeStatus = engineCommand({ cmd: "status" });
  const nativeStillOpen =
    nativeStatus.ok &&
    nativeStatus.index !== null &&
    nativeStatus.queueLen === snapshot.tracks.length;
  const index = Math.min(
    Math.max(
      0,
      nativeStillOpen ? (nativeStatus.index ?? snapshot.index) : snapshot.index,
    ),
    snapshot.tracks.length - 1,
  );
  const track = snapshot.tracks[index];
  if (!track) return false;

  queue = snapshot.tracks;
  resumeIndex = index;
  resumePositionMs = Math.max(
    0,
    nativeStillOpen ? nativeStatus.positionMs : snapshot.positionMs || 0,
  );
  resumePending = !nativeStillOpen;
  lastIndex = index;
  lastTrack = track;
  notifyQueue();
  likedResolved = null;
  resolvedUri = null;

  // Only show the restored track if nothing else has claimed the display, and
  // only then take the transport: a queue waiting to be resumed must not
  // silence a device or Spotify that is already playing.
  if (store.get(playerAtom) === null) {
    store.set(nowPlayingAtom, {
      title: track.title,
      artist: track.artist,
      cover: track.albumArt ?? "",
      duration: track.durationMs,
      progress: resumePositionMs,
      isPlaying: nativeStillOpen && nativeStatus.state === "playing",
      liked: track.liked ?? false,
      uri: track.songUri ?? "",
      album: track.album,
      artistUri: track.artistUri ?? undefined,
      albumUri: track.albumUri ?? undefined,
      ...localModes.get(),
    });
    store.set(playerAtom, "local");
    store.set(progressAtom, resumePositionMs);
    resolveLikeState(track, index);
    activate();
  } else {
    // Still answer the transport, so picking This Device and pressing play
    // reopens the engine where it left off.
    remoteBridge.setLocalHandler(handleTransport);
  }
  advertiseQueue();
  advertiseStatus(nativeStillOpen ? nativeStatus.state : "paused");
  return true;
}

/** Open the engine for a restored queue and pick up where it left off. */
async function resumeRestoredQueue(): Promise<boolean> {
  if (!resumePending || queue.length === 0 || resumeInFlight) return false;
  resumeInFlight = true;
  const restoringQueue = queue;
  try {
    const paths = await playbackPaths(restoringQueue);
    // A stop or another queue replacement invalidates this delayed open.
    if (!resumePending || queue !== restoringQueue) return false;
    await applyLocalPlaybackModes();
    if (!resumePending || queue !== restoringQueue) return false;
    const result = await openPlayback(
      restoringQueue,
      paths,
      resumeIndex,
      resumePositionMs,
      resumeWantsPlay,
    );
    if (!result.ok) throw new Error(result.error);
    resumePending = false;
    lastIndex = resumeIndex;
    lastTrack = null;
    startedAt = Date.now();
    scrobbled = false;
    openedAt = Date.now();
    sawPlaying = false;
    if (resumePositionMs > 0)
      engineCommand({ cmd: "seek", positionMs: resumePositionMs });
    if (!resumeWantsPlay) engineCommand({ cmd: "pause" });
    activate();
    pollOnce();
    return true;
  } catch (error) {
    store.set(playbackLockedUntilAtom, 0);
    store.set(nowPlayingAtom, (track) =>
      track ? { ...track, isPlaying: false } : track,
    );
    Alert.alert(
      "Could not resume playback",
      error instanceof Error ? error.message : "Please try again.",
    );
    return false;
  } finally {
    resumeInFlight = false;
    if (
      resumePending &&
      queue !== restoringQueue &&
      queue.length > 0 &&
      resumeWantsPlay
    ) {
      void resumeRestoredQueue();
    }
  }
}

export function isLocalEngineAvailable(): boolean {
  return isEngineAvailable();
}

export function localQueue(): UploadQueueTrack[] {
  return queue;
}

/** Index of the track the engine is on, as of the last poll. */
export function localQueueIndex(): number | null {
  return lastIndex;
}

/** Drop a non-current track without interrupting playback. */
export function removeLocalAt(index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= queue.length) return;
  if (index === (lastIndex ?? resumeIndex)) return;
  if (castPlayback.connected()) {
    const current = castPlayback.status();
    const next = queue.filter((_, i) => i !== index);
    const nextIndex =
      (current.index ?? 0) - (index < (current.index ?? 0) ? 1 : 0);
    void (async () => {
      await castPlayback.load(
        next,
        await playbackPaths(next),
        nextIndex,
        current.positionMs,
        current.state === "playing",
      );
      queue = next;
      lastIndex = nextIndex;
      notifyQueue();
      await saveQueueSnapshot();
    })().catch((error) => Alert.alert("Chromecast", String(error)));
    return;
  }
  if (!resumePending) {
    // The engine may have advanced since the last UI poll.
    const status = engineCommand({ cmd: "status" });
    if (
      !status.ok ||
      status.queueLen !== queue.length ||
      status.index === index
    )
      return;
    const result = engineCommand({ cmd: "remove", index });
    if (!result.ok) return;
  }
  queue = queue.filter((_, i) => i !== index);
  if (lastIndex !== null && index < lastIndex) lastIndex -= 1;
  if (resumePending) resumeIndex = lastIndex ?? 0;
  notifyQueue();
  advertiseQueue();
  void saveQueueSnapshot();
  setTimeout(pollOnce, 150);
}

function handleTransport(action: TransportAction, positionMs?: number) {
  // A restored queue has no engine behind it yet: the first transport command
  // opens it at the saved track and position instead of talking to an empty
  // engine.
  if (resumePending) {
    if (action === "pause") {
      resumeWantsPlay = false;
      // The native player can survive a JS reload; pause must never be ignored.
      engineCommand({ cmd: "pause" });
      return;
    }
    resumeWantsPlay = true;
    if (action === "seek") resumePositionMs = Math.max(0, positionMs ?? 0);
    void resumeRestoredQueue();
    return;
  }
  switch (action) {
    case "play":
      engineCommand({ cmd: "play" });
      break;
    case "pause":
      engineCommand({ cmd: "pause" });
      break;
    case "next":
      engineCommand({ cmd: "next" });
      break;
    case "previous":
      engineCommand({ cmd: "previous" });
      break;
    case "seek":
      pendingSeek = {
        position: Math.max(0, Math.round(positionMs ?? 0)),
        until: Date.now() + 2000,
      };
      engineCommand({
        cmd: "seek",
        positionMs: Math.max(0, Math.round(positionMs ?? 0)),
      });
      break;
  }
  setTimeout(pollOnce, 150);
}

function maybeScrobble(track: UploadQueueTrack, status: EngineStatus) {
  if (scrobbled || status.state !== "playing") return;
  if (!storage.getToken() || (track.localId && track.scrobbleEligible !== true))
    return;
  const duration = track.durationMs || status.durationMs;
  if (duration < MIN_TRACK_MS) return;
  const threshold = Math.min(duration * 0.5, MAX_SCROBBLE_THRESHOLD_MS);
  if (status.positionMs < threshold) return;
  scrobbled = true;
  submitScrobble({
    title: track.title,
    artist: track.artist,
    albumArtist: track.albumArtist || track.artist,
    album: track.album,
    albumArt: track.albumArt?.startsWith("https://")
      ? track.albumArt
      : undefined,
    duration,
    timestamp: Math.floor(startedAt / 1000),
  }).catch(() => {
    scrobbled = false;
  });
}

/**
 * Ask the server whether the track that just started is already loved.
 *
 * The engine knows nothing about loves, so without this the heart was always
 * drawn empty on this device, whatever the user had loved elsewhere. The
 * answer also carries the song's AT-URI, which is what makes the like button
 * work for a navidrome track — the Subsonic payload has no URI of its own.
 */
async function resolveLikeState(track: UploadQueueTrack, index: number) {
  const seq = ++likeSeq;
  nextLikeRefreshAt = Date.now() + 60_000;
  let liked: boolean | null = null;
  let uri: string | null = null;

  if (track.localId) {
    try {
      const library = await localMusicNative.library();
      liked =
        library.tracks.find((item: { id: string }) => item.id === track.localId)
          ?.favorite ?? false;
    } catch {
      liked = track.liked ?? false;
    }
  }

  if (track.navidromeId && navidromeCreds) {
    // getStarred2 is the love list for navidrome ids; getSong can't be asked,
    // since a Subsonic song exposes no URI to look it up by. Read through the
    // query cache: this runs on every track change, and the whole starred list
    // does not need refetching for each one.
    try {
      const starred = await queryClient.fetchQuery({
        queryKey: [...STARRED_IDS_KEY, navidromeCreds.handle],
        queryFn: () =>
          fetchStarredSongIds(navidromeCreds as NavidromeCredentials),
        staleTime: 60 * 1000,
      });
      liked = starred.has(track.navidromeId);
    } catch {}
  }
  const params = track.songUri
    ? { uri: track.songUri }
    : track.mbId
      ? { mbid: track.mbId }
      : null;
  if (!track.localId && liked !== true && params) {
    const state = await queryClient
      .fetchQuery({
        queryKey: ["song", "like-state", storage.getDid(), params],
        queryFn: () => getSongLikeState(params),
        staleTime: 5 * 60 * 1000,
      })
      .catch(() => null);
    if (state) {
      liked = state.liked;
      uri = state.uri;
    }
  }

  if (liked === null) nextLikeRefreshAt = Date.now() + 5000;

  // A later track (or a later lookup for this one) has taken over since.
  if (
    liked === null ||
    seq !== likeSeq ||
    queue[index] !== track ||
    lastIndex !== index
  )
    return;
  likedResolved = liked;
  resolvedUri = uri;
  track.liked = liked;
  const resolved = liked;
  if (!engineOwnsDisplay()) return;
  store.set(nowPlayingAtom, (prev) =>
    prev ? { ...prev, liked: resolved, uri: prev.uri || uri || "" } : prev,
  );
  advertiseNowPlaying(true);
}

/** Refresh after a like from another surface, such as a story. */
export function refreshLocalLikeState() {
  if (lastIndex !== null && queue[lastIndex]) {
    void resolveLikeState(queue[lastIndex], lastIndex);
  }
}

/**
 * Love / un-love whatever is playing locally.
 *
 * The transport's own toggle needs an AT-URI, which a navidrome song has
 * none of — tapping the heart simply did nothing for those. Star/unstar takes
 * the Subsonic id and has the server publish the like record, so route by
 * whichever handle the track actually carries.
 */
export async function toggleLocalLike(): Promise<boolean> {
  const index = lastIndex;
  if (index === null) return false;
  const track = queue[index];
  if (!track) return false;

  ++likeSeq; // A lookup started before this tap must not undo it.
  const current = store.get(nowPlayingAtom)?.liked ?? false;
  const next = !current;
  const apply = (value: boolean) => {
    track.liked = value;
    if (queue[index] !== track || lastIndex !== index) return;
    likedResolved = value;
    if (!engineOwnsDisplay()) return;
    store.set(nowPlayingAtom, (prev) =>
      prev ? { ...prev, liked: value } : prev,
    );
    advertiseNowPlaying(true);
  };
  apply(next);

  const uri = track.songUri ?? resolvedUri;
  try {
    if (track.localId) {
      await localMusicNative.mutate({
        action: "favorite",
        id: track.localId,
        favorite: next,
      });
      queryClient.invalidateQueries({ queryKey: ["device-library"] });
    } else if (track.navidromeId && navidromeCreds) {
      if (next) await starNavidromeSong(navidromeCreds, track.navidromeId);
      else await unstarNavidromeSong(navidromeCreds, track.navidromeId);
    } else if (uri) {
      if (next) await like(uri);
      else await unlike(uri);
    } else {
      apply(current);
      return false;
    }
  } catch {
    apply(current);
    return false;
  }
  // The cached love state is now out of date — including the favourites list the
  // library's own tab reads — so drop it rather than serve a stale heart.
  queryClient.invalidateQueries({ queryKey: STARRED_IDS_KEY });
  queryClient.invalidateQueries({ queryKey: ["song", "like-state"] });
  queryClient.invalidateQueries({ queryKey: ["navidrome", "favorites"] });
  return true;
}

/** True unless the user has switched the display to another source. */
function engineOwnsDisplay(): boolean {
  const selected = store.get(selectedSourceAtom);
  return !selected || selected.kind === "local" || selected.kind === "cast";
}

function pollOnce() {
  // Nothing is open yet — the restored queue is waiting for a play.
  if (resumePending) return;
  const status = engineCommand({ cmd: "status" });
  if (!status.ok) return;
  // Metadata is already updated optimistically; wait for the native queue to catch up.
  if (status.queueLen !== queue.length) return;

  if (status.state === "playing") sawPlaying = true;
  // Don't mistake the engine's startup lag for the queue having ended.
  const settled = sawPlaying || Date.now() - openedAt > 10_000;
  const finished =
    status.state === "stopped" &&
    settled &&
    (status.index === null || status.queueLen === 0);
  if (finished) {
    deactivate();
    return;
  }

  const index = status.index;
  if (index === null) return;
  const track = queue[index];
  if (!track) return;

  const trackChanged = track !== lastTrack;
  if (trackChanged) pendingSeek = null;
  if (index !== lastIndex || trackChanged) notifyQueue();
  lastTrack = track;
  lastIndex = index;
  if (trackChanged) {
    startedAt = Date.now();
    scrobbled = false;
    likedResolved = track.liked ?? null;
    resolvedUri = null;
    resolveLikeState(track, index);
  } else if (Date.now() >= nextLikeRefreshAt) {
    void resolveLikeState(track, index);
  }

  const durationMs = track.durationMs || status.durationMs;
  let positionMs = status.positionMs;
  if (pendingSeek) {
    if (
      Date.now() < pendingSeek.until &&
      Math.abs(positionMs - pendingSeek.position) > 1500
    )
      positionMs = pendingSeek.position;
    else pendingSeek = null;
  }
  resumePositionMs = positionMs;
  // The engine keeps playing when the user looks at another device, but it
  // must not write the display then — that is the other source's to own.
  if (engineOwnsDisplay()) {
    store.set(nowPlayingAtom, {
      title: track.title,
      artist: track.artist,
      cover: track.albumArt ?? "",
      duration: durationMs,
      progress: positionMs,
      isPlaying:
        Date.now() < store.get(playbackLockedUntilAtom)
          ? (store.get(nowPlayingAtom)?.isPlaying ?? status.state === "playing")
          : status.state === "playing",
      // Love state belongs to this queue track, never the previously displayed source.
      liked: likedResolved ?? track.liked ?? false,
      uri: track.songUri ?? resolvedUri ?? "",
      album: track.album,
      artistUri: track.artistUri ?? undefined,
      albumUri: track.albumUri ?? undefined,
      ...localModes.get(),
    });
    store.set(playerAtom, castPlayback.connected() ? "cast" : "local");
    store.set(progressAtom, positionMs);
  }

  advertiseNowPlaying(trackChanged);
  advertiseStatus(status.state);
  advertiseQueue();
  // Throttle position saves without postponing them on every poll; a track change
  // flushes it so a quit right after a skip still resumes on the right track.
  if (trackChanged) void saveQueueSnapshot();
  else scheduleQueueSave();

  maybeScrobble(track, status);
}

function activate() {
  store.set(localEngineActiveAtom, true);
  remoteBridge.setLocalHandler(handleTransport);
  remoteBridge.setRoute("local", null);
  if (!pollTimer) {
    pollTimer = setInterval(pollOnce, 500);
  }
}

function deactivate() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  remoteBridge.setLocalHandler(null);
  store.set(localEngineActiveAtom, false);
  lastIndex = null;
  if (["local", "cast"].includes(store.get(playerAtom) ?? "")) {
    store.set(nowPlayingAtom, null);
    store.set(playerAtom, null);
    store.set(progressAtom, 0);
  }
}

/** The URL to hand the engine for a track, whatever its source. */
function streamUrlFor(track: UploadQueueTrack): string {
  if (track.streamUrl) return track.streamUrl;
  // A restored queue carries no stream URL — it is credentialed, so it isn't
  // persisted — and is rebuilt from the Subsonic id instead.
  if (track.navidromeId && navidromeCreds) {
    return navidromeStreamUrl(track.navidromeId, navidromeCreds);
  }
  return getStreamUrl(track.uploadId);
}

async function playbackPaths(
  tracks: UploadQueueTrack[],
): Promise<string[] | CastPathResolver> {
  if (!castPlayback.connected()) return resolvePaths(tracks);
  const owner = storage.getToken();
  let localTracks: Promise<Map<string, DeviceTrack>> | undefined;
  const resolve: CastPathResolver = async (track, _index, signal) => {
    if (signal.aborted || storage.getToken() !== owner)
      throw new Error("Chromecast queue changed.");
    if (track.localId) {
      localTracks ??= localMusicNative
        .library()
        .then(
          (library) =>
            new Map<string, DeviceTrack>(
              library.tracks.map((item: DeviceTrack) => [item.id, item]),
            ),
        );
      const current = (await localTracks).get(track.localId);
      if (!current)
        throw new Error(`Local file is no longer available: ${track.title}`);
      Object.assign(track, deviceQueueTrack(current));
      if (signal.aborted) throw new Error("Chromecast queue changed.");
      return localMusicNative.path(track.localId);
    }
    if (track.streamUrl) return track.streamUrl;
    if (!track.navidromeId) return getCastStreamUrl(track.uploadId, signal);
    // Resolve Navidrome credentials once on demand; subsequent tracks reuse them.
    return (await resolvePaths([track]))[0];
  };
  return resolve;
}

async function resolvePaths(tracks: UploadQueueTrack[]): Promise<string[]> {
  if (tracks.some((track) => track.localId)) {
    const library = await localMusicNative.library();
    const deviceTracks = new Map<string, DeviceTrack>(
      library.tracks.map((track: DeviceTrack) => [track.id, track]),
    );
    for (const track of tracks) {
      if (!track.localId) continue;
      const current = deviceTracks.get(track.localId);
      if (!current)
        throw new Error(`Local file is no longer available: ${track.title}`);
      Object.assign(track, deviceQueueTrack(current));
    }
  }
  if (
    tracks.some((track) => track.navidromeId && !track.streamUrl) &&
    !navidromeCreds
  ) {
    const did = storage.getDid();
    if (!did) throw new Error("Sign in to resume your library tracks.");
    const profile = store.get(profileAtom) ?? (await getProfileByDid(did));
    if (!profile?.handle)
      throw new Error("Could not load your library account. Please try again.");
    const credentials = await queryClient.fetchQuery<NavidromeCredentials>({
      queryKey: ["navidrome", "credentials", profile.handle],
      staleTime: Number.POSITIVE_INFINITY,
      queryFn: async () => ({
        handle: profile.handle,
        apiKey: await resolveNavidromeApiKey(),
      }),
    });
    setEngineNavidromeCredentials(credentials);
  }
  // Only the upload-backed path needs the token; a navidrome queue carries its
  // own credentialed URLs.
  const needsToken = tracks.some(
    (t) => !t.localId && !t.streamUrl && !t.navidromeId,
  );
  const casting = castPlayback.connected();
  if (needsToken && !casting) await ensureStreamToken();
  return mapConcurrent(tracks, async (track) =>
    track.localId
      ? await localMusicNative.path(track.localId)
      : casting && !track.navidromeId && !track.streamUrl
        ? await getCastStreamUrl(track.uploadId)
        : streamUrlFor(track),
  );
}

/** Replace the queue with `tracks` and start playing at `startIndex`. */
export async function playUploads(
  tracks: UploadQueueTrack[],
  startIndex: number,
): Promise<boolean> {
  const session = storage.getToken();
  if (!session && tracks.some((track) => !track.localId)) return false;
  if (!isEngineAvailable() || tracks.length === 0) return false;
  const casting = castPlayback.connected();
  const paths = await playbackPaths(tracks);
  if (casting !== castPlayback.connected()) return false;
  await applyLocalPlaybackModes();
  if (storage.getToken() !== session) return false;
  const result = await openPlayback(tracks, paths, startIndex);
  if (!result.ok) return false;
  queue = tracks;
  resumePending = false;
  resumeIndex = startIndex;
  resumePositionMs = 0;
  store.set(selectedSourceAtom, {
    kind: castPlayback.connected() ? "cast" : "local",
  });
  lastIndex = startIndex;
  lastTrack = null;
  pendingSeek = null;
  notifyQueue();
  startedAt = Date.now();
  scrobbled = false;
  openedAt = Date.now();
  sawPlaying = false;
  await saveQueueSnapshot();
  if (storage.getToken() !== session) return false;
  activate();
  pollOnce();
  return true;
}

/**
 * Queue `tracks` right after whatever is playing, or start them if nothing is.
 *
 * The engine only knows URLs, so the metadata queue has to be spliced at the
 * same place the engine inserts — immediately after the current index.
 */
export async function queueUploadsNext(
  tracks: UploadQueueTrack[],
): Promise<boolean> {
  return enqueueLocalTracks(tracks, "next");
}

/** Queue tracks at the end without replacing a paused restored queue. */
export async function queueUploadsLast(
  tracks: UploadQueueTrack[],
): Promise<boolean> {
  return enqueueLocalTracks(tracks, "last");
}

async function enqueueLocalTracks(
  tracks: UploadQueueTrack[],
  where: "next" | "last",
): Promise<boolean> {
  if (!isEngineAvailable() || tracks.length === 0) return false;
  if (queue.length === 0) return playUploads(tracks, 0);
  let index = lastIndex ?? resumeIndex;
  if (castPlayback.connected()) {
    const current = castPlayback.status();
    index = current.index ?? index;
    const at = where === "next" ? index + 1 : queue.length;
    const next = [...queue.slice(0, at), ...tracks, ...queue.slice(at)];
    await castPlayback.load(
      next,
      await playbackPaths(next),
      index,
      current.positionMs,
      current.state === "playing",
    );
    queue = next;
    notifyQueue();
    advertiseQueue();
    await saveQueueSnapshot();
    return true;
  }
  if (!resumePending) {
    const paths = await resolvePaths(tracks);
    // URL resolution can take time: read the current track after it completes.
    const status = engineCommand({ cmd: "status" });
    if (!status.ok || status.queueLen !== queue.length) return false;
    if (status.index === null) return playUploads(tracks, 0);
    const result = engineCommand({
      cmd: where === "next" ? "insertNext" : "append",
      paths,
    });
    if (!result.ok) return false;
    index = status.index;
    lastIndex = index;
    resumePositionMs = pendingSeek?.position ?? status.positionMs;
  }
  const at = where === "next" ? index + 1 : queue.length;
  queue = [...queue.slice(0, at), ...tracks, ...queue.slice(at)];
  notifyQueue();
  advertiseQueue();
  await saveQueueSnapshot();
  return true;
}

export function skipToLocal(index: number) {
  if (index < 0 || index >= queue.length) return;
  if (resumePending) {
    resumeWantsPlay = true;
    resumeIndex = index;
    resumePositionMs = 0;
    void resumeRestoredQueue();
    return;
  }
  engineCommand({ cmd: "skipTo", index });
  setTimeout(pollOnce, 150);
}

export function stopLocalPlayback() {
  engineCommand({ cmd: "stop" });
  queue = [];
  lastTrack = null;
  pendingSeek = null;
  notifyQueue();
  resumePending = false;
  void saveQueueSnapshot();
  deactivate();
}

// ─── Broadcast as a controllable remote player ───────────────────────────────
//
// The phone registers itself on the remote-control WebSocket through the SDK's
// RemotePlayer, so it shows up in every other client's device picker and can be
// driven from them — the same protocol playerd and the desktop app speak.

let remotePlayer: RemotePlayer | null = null;
let lastAdvertisedAt = 0;
let advertisedStatus: "playing" | "paused" | "stopped" | null = null;
let advertisedQueueKey = "";

const deviceLabel = (): string =>
  Constants.deviceName ??
  (Platform.OS === "android" ? "Rocksky Android" : "Rocksky iOS");

const toRemoteQueueItem = (track: UploadQueueTrack): RemoteQueueItem => ({
  // A navidrome song is addressed by its Subsonic id, an upload by its id;
  // sending the right one is what lets a controller re-enqueue it.
  uploadId: track.localId || track.navidromeId ? undefined : track.uploadId,
  trackId: track.navidromeId,
  title: track.title,
  artist: track.artist,
  album: track.album,
  albumArtist: track.albumArtist,
  albumArt: track.albumArt?.startsWith("https://") ? track.albumArt : undefined,
  durationMs: track.durationMs,
  songUri: track.songUri ?? undefined,
  albumUri: track.albumUri ?? undefined,
});

/** Mirror the playing track out to controllers; throttled unless `force`. */
function advertiseNowPlaying(force = false) {
  const player = remotePlayer;
  if (!player) return;
  const index = lastIndex;
  const track = index !== null ? queue[index] : undefined;
  const np = store.get(nowPlayingAtom);
  if (!track || !np) return;
  const now = Date.now();
  // The engine polls twice a second; controllers only need a few updates a
  // second to animate smoothly, so progress goes out every two.
  if (!force && now - lastAdvertisedAt < 2000) return;
  lastAdvertisedAt = now;
  player.setNowPlaying({
    title: track.title,
    artist: track.artist,
    album: track.album,
    albumArtist: track.albumArtist,
    albumArt: track.albumArt?.startsWith("https://")
      ? track.albumArt
      : undefined,
    durationMs: np.duration,
    elapsedMs: np.progress,
    isPlaying: np.isPlaying,
    shuffle: np.shuffle,
    repeat: np.repeat,
    songUri: track.songUri ?? undefined,
    albumUri: track.albumUri ?? undefined,
    artistUri: track.artistUri ?? undefined,
    sha256: track.sha256 || undefined,
    liked: np.liked,
  });
}

function advertiseStatus(state: "playing" | "paused" | "stopped") {
  if (!remotePlayer || advertisedStatus === state) return;
  advertisedStatus = state;
  remotePlayer.setStatus(state);
}

function advertiseQueue() {
  if (!remotePlayer) return;
  const index = lastIndex ?? 0;
  const key = `${queue.length}:${index}:${queue[0]?.uploadId ?? ""}`;
  if (key === advertisedQueueKey) return;
  advertisedQueueKey = key;
  remotePlayer.setQueue(queue.map(toRemoteQueueItem), index);
}

function fromRemoteQueueItem(item: RemoteQueueItem): UploadQueueTrack | null {
  const base = {
    title: item.title,
    artist: item.artist,
    albumArtist: item.albumArtist ?? item.artist,
    album: item.album ?? "",
    albumArt: item.albumArt ?? null,
    durationMs: item.durationMs ?? 0,
    songUri: item.songUri ?? null,
    albumUri: item.albumUri ?? null,
    artistUri: null,
    sha256: "",
  };
  if (item.trackId && navidromeCreds) {
    return {
      ...base,
      uploadId: item.trackId,
      navidromeId: item.trackId,
      streamUrl: navidromeStreamUrl(item.trackId, navidromeCreds),
    };
  }
  // Without credentials a navidrome id can't be turned into a stream URL, and
  // an item with neither id is unplayable: drop it rather than queue silence.
  if (item.uploadId) return { ...base, uploadId: item.uploadId };
  return null;
}

async function handleRemoteEnqueue(cmd: EnqueueCommand) {
  const tracks = cmd.tracks
    .map(fromRemoteQueueItem)
    .filter((track): track is UploadQueueTrack => track !== null);
  if (tracks.length === 0) return;
  const ordered = cmd.shuffle ? shuffleTracks(tracks) : tracks;
  if (cmd.mode === "next") {
    await queueUploadsNext(ordered);
    return;
  }
  if (cmd.mode === "last") {
    await queueUploadsLast(ordered);
    return;
  }
  const startIndex = cmd.shuffle
    ? 0
    : Math.min(Math.max(0, cmd.startIndex), ordered.length - 1);
  await playUploads(ordered, startIndex);
}

function shuffleTracks(tracks: UploadQueueTrack[]): UploadQueueTrack[] {
  const out = [...tracks];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Register this device on the remote-control socket.
 *
 * Connected for as long as the user is signed in, not only while playing, so
 * another client can enqueue to an idle phone and have it start.
 *
 * queueMove is not registered because the engine has no move command.
 */
export function startLocalRemotePlayer() {
  if (remotePlayer || !isEngineAvailable() || !storage.getToken()) return;
  const player = new RemotePlayer({
    token: () => storage.getToken() ?? undefined,
    name: deviceLabel(),
  });
  player
    .on("play", () => handleTransport("play"))
    .on("pause", () => handleTransport("pause"))
    .on("next", () => handleTransport("next"))
    .on("previous", () => handleTransport("previous"))
    .on("seek", (positionMs) => handleTransport("seek", positionMs))
    .on("enqueue", (cmd) => {
      handleRemoteEnqueue(cmd);
    })
    .on("setAudioSettings", (settings) => {
      engineCommand({ cmd: "setAudioSettings", settings });
    })
    .on("queueJump", (index) => skipToLocal(index))
    .on("queueRemove", (index) => removeLocalAt(index))
    .on("setShuffle", setLocalShuffle)
    .on("setRepeat", setLocalRepeat)
    .on("setVolume", (volume) => {
      engineCommand({ cmd: "setVolume", volume });
      setTimeout(pollOnce, 150);
    });
  player.connect();
  remotePlayer = player;
  advertisedStatus = null;
  advertisedQueueKey = "";
  // Catch a controller up if playback is already under way.
  advertiseQueue();
  advertiseNowPlaying(true);
}

export function stopLocalRemotePlayer() {
  if (!remotePlayer) return;
  remotePlayer.setStatus("stopped");
  remotePlayer.disconnect();
  remotePlayer = null;
  advertisedStatus = null;
  advertisedQueueKey = "";
}

/**
 * This phone's own device id on the remote socket.
 *
 * The picker lists it as "This Device" already, so the registry entry for
 * ourselves has to be filtered out or the same player appears twice.
 */
export function localRemoteDeviceId(): string | null {
  return remotePlayer?.id || null;
}
