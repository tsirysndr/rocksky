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

/** Replace the queue with `tracks` and start playing at `startIndex`. */
export async function playUploads(
  tracks: UploadQueueTrack[],
  startIndex: number,
): Promise<boolean> {
  if (!isEngineAvailable() || tracks.length === 0) return false;
  await ensureStreamToken();
  const paths = tracks.map((t) => getStreamUrl(t.uploadId));
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

export function skipToLocal(index: number) {
  engineCommand({ cmd: "skipTo", index });
  setTimeout(pollOnce, 150);
}

export function stopLocalPlayback() {
  engineCommand({ cmd: "stop" });
  queue = [];
  deactivate();
}
