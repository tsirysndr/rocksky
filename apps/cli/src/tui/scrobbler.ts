import { RockskyClient } from "client";
import { playerController, type QueueItem } from "./player";

// Last.fm scrobbling rules: a track is scrobbled once it has played for at
// least half its duration OR 4 minutes, whichever comes first — and only if it
// is longer than 30 seconds.
const MIN_TRACK_MS = 30_000;
const MAX_THRESHOLD_MS = 4 * 60_000;

let currentKey: string | null = null;
let scrobbled = false;

/**
 * Called on a short interval. Watches the player's position and submits a
 * scrobble once the Last.fm threshold is reached for the current track.
 */
export function scrobblerTick(
  token: string | undefined,
  onScrobbled?: (item: QueueItem) => void,
) {
  const status = playerController.status();
  if (!status || status.state === "stopped" || status.index == null) {
    currentKey = null;
    scrobbled = false;
    return;
  }

  const item = playerController.currentItem();
  if (!item) return;

  const key = `${status.index}:${item.uploadId}`;
  if (key !== currentKey) {
    currentKey = key;
    scrobbled = false;
  }

  if (scrobbled || !token) return;

  const duration = status.duration_ms || item.duration || 0;
  if (duration < MIN_TRACK_MS) return;

  const threshold = Math.min(duration / 2, MAX_THRESHOLD_MS);
  if ((status.position_ms || 0) < threshold) return;

  scrobbled = true;
  submit(token, item).then(
    () => onScrobbled?.(item),
    () => {
      /* keep scrobbled=true to avoid hammering a failing endpoint this play */
    },
  );
}

async function submit(token: string, item: QueueItem) {
  await new RockskyClient(token).scrobbleNowPlaying({
    title: item.title,
    artist: item.artist,
    album: item.album || item.title,
    albumArtist: item.albumArtist || item.artist,
    duration: item.duration || 0,
    albumArt: item.albumArt,
    timestamp: Math.floor(Date.now() / 1000),
  });
}
