import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  type EnqueueCommand,
  RemotePlayer,
  type RemoteQueueItem,
} from "@rocksky/sdk/remote";
import Constants from "expo-constants";
import { getDefaultStore } from "jotai";
import { Platform } from "react-native";
import {
  type EngineStatus,
  engineCommand,
  isEngineAvailable,
} from "../../modules/rocksky-engine";
import { getSongLikeState, like, unlike } from "../api/likes";
import {
  fetchStarredSongIds,
  type NavidromeCredentials,
  navidromeStreamUrl,
  starNavidromeSong,
  unstarNavidromeSong,
} from "../api/navidrome";
import {
  ensureStreamToken,
  getStreamUrl,
  submitScrobble,
} from "../api/uploads";
import { selectedSourceAtom } from "../atoms/devices";
import {
  localEngineActiveAtom,
  nowPlayingAtom,
  playerAtom,
  progressAtom,
} from "../atoms/nowplaying";
import { storage } from "../storage";
import { remoteBridge, type TransportAction } from "./remoteBridge";

// Local playback of uploads through the native Rust engine: owns the queue
// metadata (the engine only knows URLs), mirrors engine state into the shared
// now-playing atoms, routes transport actions, and scrobbles.

export type UploadQueueTrack = {
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
  /** Subsonic song id, when the track came from navidrome. Its like state is
   *  star/unstar on that id, since there is no AT-URI to address. */
  navidromeId?: string;
  /**
   * A ready-to-play URL, for sources that don't go through /uploads/:id/stream
   * — navidrome's ids are not upload ids. Left unset, the URL is built from
   * `uploadId` and a short-lived stream token.
   */
  streamUrl?: string;
};

const MIN_TRACK_MS = 30_000;
const MAX_SCROBBLE_THRESHOLD_MS = 4 * 60_000;

const store = getDefaultStore();

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
// Navidrome credentials, published by useNavidromeCredentials: star/unstar is
// the only like path for a navidrome song, and this module is outside React.
let navidromeCreds: NavidromeCredentials | null = null;

export function setEngineNavidromeCredentials(creds: NavidromeCredentials) {
  navidromeCreds = creds;
}

// ─── Queue persistence ───────────────────────────────────────────────────────
//
// The queue lives in this module, so quitting the app used to lose it. It is
// snapshotted to AsyncStorage and restored paused on the next launch; the
// engine is only reopened when the user presses play, exactly like the web
// client's upload player.

const QUEUE_KEY = "local-queue";
const SAVE_DEBOUNCE_MS = 1500;

type PersistedQueue = {
  tracks: UploadQueueTrack[];
  index: number;
  positionMs: number;
};

let saveTimer: ReturnType<typeof setTimeout> | null = null;
// True once a restored queue is loaded but the engine has not been opened for
// it yet: polling has to stay quiet, or the empty engine looks like a queue
// that just ended and the restored track is wiped.
let resumePending = false;
let resumeIndex = 0;
let resumePositionMs = 0;

function scheduleQueueSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void saveQueueSnapshot();
  }, SAVE_DEBOUNCE_MS);
}

async function saveQueueSnapshot() {
  try {
    if (queue.length === 0) {
      await AsyncStorage.removeItem(QUEUE_KEY);
      return;
    }
    const snapshot: PersistedQueue = {
      // streamUrl is dropped on purpose: the navidrome one embeds the user's
      // API key and the upload one a short-lived token, so both are rebuilt.
      tracks: queue.map(({ streamUrl: _streamUrl, ...track }) => track),
      index: lastIndex ?? resumeIndex,
      positionMs: store.get(progressAtom),
    };
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(snapshot));
  } catch {}
}

/**
 * Bring back the queue the app was last playing, paused.
 *
 * Only the metadata and the saved position are restored; the engine stays
 * closed until play is pressed, so a cold start makes no sound. The atoms are
 * claimed only when no other source has, so a restored queue never elbows out
 * a remote device or Spotify.
 */
export async function restoreLocalQueue(): Promise<boolean> {
  if (!isEngineAvailable() || queue.length > 0) return false;
  let snapshot: PersistedQueue | null = null;
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    snapshot = raw ? (JSON.parse(raw) as PersistedQueue) : null;
  } catch {
    return false;
  }
  if (!snapshot?.tracks?.length) return false;

  const index = Math.min(
    Math.max(0, snapshot.index),
    snapshot.tracks.length - 1,
  );
  const track = snapshot.tracks[index];
  if (!track) return false;

  queue = snapshot.tracks;
  resumeIndex = index;
  resumePositionMs = Math.max(0, snapshot.positionMs || 0);
  resumePending = true;
  lastIndex = index;
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
      isPlaying: false,
      liked: false,
      uri: track.songUri ?? "",
      album: track.album,
      artistUri: track.artistUri ?? undefined,
      albumUri: track.albumUri ?? undefined,
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
  advertiseStatus("paused");
  return true;
}

/** Open the engine for a restored queue and pick up where it left off. */
async function resumeRestoredQueue(): Promise<boolean> {
  if (!resumePending || queue.length === 0) return false;
  resumePending = false;
  const paths = await resolvePaths(queue);
  const result = engineCommand({
    cmd: "open",
    paths,
    startIndex: resumeIndex,
  });
  if (!result.ok) {
    resumePending = true;
    return false;
  }
  lastIndex = null;
  startedAt = Date.now();
  scrobbled = false;
  openedAt = Date.now();
  sawPlaying = false;
  if (resumePositionMs > 0) {
    engineCommand({ cmd: "seek", positionMs: resumePositionMs });
  }
  activate();
  pollOnce();
  return true;
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

/** Drop one track from the local queue, keeping the metadata in step. */
export function removeLocalAt(index: number) {
  if (index < 0 || index >= queue.length) return;
  const result = engineCommand({ cmd: "remove", index });
  if (!result.ok) return;
  queue = queue.filter((_, i) => i !== index);
  if (lastIndex !== null && index < lastIndex) lastIndex -= 1;
  setTimeout(pollOnce, 150);
}

function handleTransport(action: TransportAction, positionMs?: number) {
  // A restored queue has no engine behind it yet: the first transport command
  // opens it at the saved track and position instead of talking to an empty
  // engine.
  if (resumePending) {
    if (action === "pause") return;
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
    albumArt: track.albumArt ?? undefined,
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
  let liked: boolean | null = null;
  let uri: string | null = null;

  if (track.navidromeId && navidromeCreds) {
    // getStarred2 is the love list for navidrome ids; getSong can't be asked,
    // since a Subsonic song exposes no URI to look it up by.
    try {
      const starred = await fetchStarredSongIds(navidromeCreds);
      liked = starred.has(track.navidromeId);
    } catch {}
  }
  const params = track.songUri
    ? { uri: track.songUri }
    : track.mbId
      ? { mbid: track.mbId }
      : null;
  if (liked === null && params) {
    const state = await getSongLikeState(params);
    if (state) {
      liked = state.liked;
      uri = state.uri;
    }
  }

  // A later track (or a later lookup for this one) has taken over since.
  if (liked === null || seq !== likeSeq || lastIndex !== index) return;
  likedResolved = liked;
  resolvedUri = uri;
  const resolved = liked;
  store.set(nowPlayingAtom, (prev) =>
    prev ? { ...prev, liked: resolved, uri: prev.uri || uri || "" } : prev,
  );
  advertiseNowPlaying(true);
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
  const track = index !== null ? queue[index] : undefined;
  if (!track) return false;

  const current = store.get(nowPlayingAtom)?.liked ?? false;
  const next = !current;
  const apply = (value: boolean) => {
    likedResolved = value;
    store.set(nowPlayingAtom, (prev) =>
      prev ? { ...prev, liked: value } : prev,
    );
    advertiseNowPlaying(true);
  };
  apply(next);

  const uri = track.songUri ?? resolvedUri;
  try {
    if (track.navidromeId && navidromeCreds) {
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
  return true;
}

/** True unless the user has switched the display to another source. */
function engineOwnsDisplay(): boolean {
  const selected = store.get(selectedSourceAtom);
  return !selected || selected.kind === "local";
}

function pollOnce() {
  // Nothing is open yet — the restored queue is waiting for a play.
  if (resumePending) return;
  const status = engineCommand({ cmd: "status" });
  if (!status.ok) return;

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

  const trackChanged = index !== lastIndex;
  if (trackChanged) {
    lastIndex = index;
    startedAt = Date.now();
    scrobbled = false;
    likedResolved = null;
    resolvedUri = null;
    resolveLikeState(track, index);
  }

  const durationMs = track.durationMs || status.durationMs;
  // The engine keeps playing when the user looks at another device, but it
  // must not write the display then — that is the other source's to own.
  if (engineOwnsDisplay()) {
    store.set(nowPlayingAtom, (prev) => ({
      title: track.title,
      artist: track.artist,
      cover: track.albumArt ?? "",
      duration: durationMs,
      progress: status.positionMs,
      isPlaying: status.state === "playing",
      // Within one track the atom is authoritative, so the server's answer and
      // the user's own tap both survive the next tick. Keying this on the uri
      // instead meant a track with no AT-URI — every navidrome one — had its
      // love state wiped twice a second.
      liked: trackChanged
        ? (likedResolved ?? false)
        : (prev?.liked ?? likedResolved ?? false),
      uri: track.songUri ?? resolvedUri ?? "",
      album: track.album,
      artistUri: track.artistUri ?? undefined,
      albumUri: track.albumUri ?? undefined,
      shuffle: status.shuffle,
      repeat: status.repeat,
    }));
    store.set(playerAtom, "local");
    store.set(progressAtom, status.positionMs);
  }

  advertiseNowPlaying(trackChanged);
  advertiseStatus(status.state);
  advertiseQueue();
  // The position moves constantly, so the snapshot is debounced; a track change
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
  if (store.get(playerAtom) === "local") {
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

async function resolvePaths(tracks: UploadQueueTrack[]): Promise<string[]> {
  // Only the upload-backed path needs the token; a navidrome queue carries its
  // own credentialed URLs.
  const needsToken = tracks.some((t) => !t.streamUrl && !t.navidromeId);
  if (needsToken) await ensureStreamToken();
  return tracks.map(streamUrlFor);
}

/** Replace the queue with `tracks` and start playing at `startIndex`. */
export async function playUploads(
  tracks: UploadQueueTrack[],
  startIndex: number,
): Promise<boolean> {
  if (!isEngineAvailable() || tracks.length === 0) return false;
  const paths = await resolvePaths(tracks);
  const result = engineCommand({ cmd: "open", paths, startIndex });
  if (!result.ok) return false;
  queue = tracks;
  lastIndex = null;
  startedAt = Date.now();
  scrobbled = false;
  openedAt = Date.now();
  sawPlaying = false;
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
  if (!isEngineAvailable() || tracks.length === 0) return false;
  const status = engineCommand({ cmd: "status" });
  if (!status.ok || status.index === null || queue.length === 0) {
    return playUploads(tracks, 0);
  }
  const paths = await resolvePaths(tracks);
  const result = engineCommand({ cmd: "insertNext", paths });
  if (!result.ok) return false;
  const at = status.index + 1;
  queue = [...queue.slice(0, at), ...tracks, ...queue.slice(at)];
  return true;
}

/** Queue `tracks` at the end, or start them if nothing is playing. */
export async function queueUploadsLast(
  tracks: UploadQueueTrack[],
): Promise<boolean> {
  if (!isEngineAvailable() || tracks.length === 0) return false;
  const status = engineCommand({ cmd: "status" });
  if (!status.ok || status.index === null || queue.length === 0) {
    return playUploads(tracks, 0);
  }
  const paths = await resolvePaths(tracks);
  const result = engineCommand({ cmd: "append", paths });
  if (!result.ok) return false;
  queue = [...queue, ...tracks];
  return true;
}

export function skipToLocal(index: number) {
  engineCommand({ cmd: "skipTo", index });
  setTimeout(pollOnce, 150);
}

export function stopLocalPlayback() {
  engineCommand({ cmd: "stop" });
  queue = [];
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
  uploadId: track.navidromeId ? undefined : track.uploadId,
  trackId: track.navidromeId,
  title: track.title,
  artist: track.artist,
  album: track.album,
  albumArtist: track.albumArtist,
  albumArt: track.albumArt ?? undefined,
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
    albumArt: track.albumArt ?? undefined,
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
 * queueMove and setAudioSettings are deliberately not registered: the engine
 * has no move command and no DSP settings, and leaving a handler out is how the
 * protocol says a player declines a capability.
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
    .on("queueJump", (index) => skipToLocal(index))
    .on("queueRemove", (index) => removeLocalAt(index))
    .on("setShuffle", (enabled) => {
      engineCommand({ cmd: "setShuffle", enabled });
      setTimeout(pollOnce, 150);
    })
    .on("setRepeat", (mode) => {
      engineCommand({ cmd: "setRepeat", mode });
      setTimeout(pollOnce, 150);
    })
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
