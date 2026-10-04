import { getDefaultStore } from "jotai";
import {
  type EngineStatus,
  engineCommand,
  isEngineAvailable,
} from "../../modules/rocksky-engine";
import {
  ensureStreamToken,
  getStreamUrl,
  submitScrobble,
} from "../api/uploads";
import {
  localEngineActiveAtom,
  nowPlayingAtom,
  playerAtom,
  progressAtom,
} from "../atoms/nowplaying";
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

function pollOnce() {
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
  const track = index !== null ? queue[index] : undefined;
  if (!track) return;

  if (index !== lastIndex) {
    lastIndex = index;
    startedAt = Date.now();
    scrobbled = false;
  }

  const durationMs = track.durationMs || status.durationMs;
  store.set(nowPlayingAtom, (prev) => ({
    title: track.title,
    artist: track.artist,
    cover: track.albumArt ?? "",
    duration: durationMs,
    progress: status.positionMs,
    isPlaying: status.state === "playing",
    liked: prev?.uri === track.songUri ? (prev?.liked ?? false) : false,
    uri: track.songUri ?? "",
    album: track.album,
    artistUri: track.artistUri ?? undefined,
    albumUri: track.albumUri ?? undefined,
    shuffle: status.shuffle,
    repeat: status.repeat,
  }));
  store.set(playerAtom, "local");
  store.set(progressAtom, status.positionMs);

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

async function resolvePaths(tracks: UploadQueueTrack[]): Promise<string[]> {
  // Only the upload-backed path needs the token; a navidrome queue carries its
  // own credentialed URLs.
  if (tracks.some((t) => !t.streamUrl)) await ensureStreamToken();
  return tracks.map((t) => t.streamUrl ?? getStreamUrl(t.uploadId));
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
  deactivate();
}
