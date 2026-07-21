import { RockskyClient } from "client";
import { playerController, type QueueItem } from "./player";
import { cachePath, cacheTrack, isCached } from "./trackCache";

// Resolve each track to a playable entry: the cached local file when present
// (gapless, instant), otherwise a fresh streaming URL.
async function playableUris(token: string, tracks: QueueItem[]) {
  const client = new RockskyClient(token);
  const { token: streamToken } = await client.getStreamToken();
  return tracks.map((t) =>
    isCached(t) ? cachePath(t) : client.streamUrl(t.uploadId, streamToken),
  );
}

export async function streamAndPlay(
  token: string,
  tracks: QueueItem[],
  index = 0,
) {
  if (tracks.length === 0) return;
  await playerController.playQueue(tracks, await playableUris(token, tracks), index);
  // Cache the track we just started so replays (and resume) are instant.
  cacheTrack(token, tracks[index]).catch(() => {});
}

/** Insert tracks right after the current one ("play next"). Caches first. */
export async function enqueueNext(token: string, tracks: QueueItem[]) {
  if (tracks.length === 0) return;
  await Promise.all(tracks.map((t) => cacheTrack(token, t).catch(() => {})));
  await playerController.playNext(tracks, await playableUris(token, tracks));
}

/** Append tracks to the end of the queue ("play last"). Caches first. */
export async function enqueueLast(token: string, tracks: QueueItem[]) {
  if (tracks.length === 0) return;
  await Promise.all(tracks.map((t) => cacheTrack(token, t).catch(() => {})));
  await playerController.playLast(tracks, await playableUris(token, tracks));
}

/** Insert tracks at any rockbox InsertPosition. */
export async function enqueueAt(
  token: string,
  tracks: QueueItem[],
  position: number,
) {
  if (tracks.length === 0) return;
  await Promise.all(tracks.map((t) => cacheTrack(token, t).catch(() => {})));
  await playerController.insertAt(tracks, await playableUris(token, tracks), position);
}

/**
 * Resume the session restored on startup: rebuild playable entries (cached
 * where possible), start at the saved track, and seek to the saved position.
 */
export async function resumeSession(token: string) {
  const restored = playerController.restored;
  if (!restored) return;
  const uris = await playableUris(token, restored.items);
  await playerController.playQueue(restored.items, uris, restored.index);
  if (restored.positionMs > 0) playerController.seekMs(restored.positionMs);
  playerController.restored = null;
}

// Runs on a short interval. Two jobs:
//  1. Always ensure the *currently playing* track is cached — so every track
//     you actually listen to ends up on disk, regardless of skips or how the
//     stream's duration is reported. (cacheTrack de-dupes in-flight downloads.)
//  2. Once the current track passes the halfway point, prefetch the *next*
//     track and hot-swap its queue entry to the local file, so the engine has
//     fully-decoded audio ready to crossfade / play gaplessly.
const prefetching = new Set<string>();

// Download `item` to cache (if it has an uploadId and isn't already cached or
// in flight), tracked by uploadId so we don't pile up duplicate requests.
async function ensureCached(token: string, item: QueueItem | undefined) {
  if (!item?.uploadId || isCached(item) || prefetching.has(item.uploadId)) {
    return;
  }
  prefetching.add(item.uploadId);
  try {
    await cacheTrack(token, item);
  } catch {
    // network / disk hiccup — will be retried on a later tick
  } finally {
    prefetching.delete(item.uploadId);
  }
}

export async function prefetchTick(token: string | undefined) {
  if (!token) return;
  const status = playerController.status();
  if (!status || status.index == null || status.queue_len === 0) return;

  // 1. Cache the current track (ungated).
  void ensureCached(token, playerController.queueItems[status.index]);

  // 2. Prefetch + swap the next track once we're past the halfway point.
  const duration = status.duration_ms || 0;
  if (duration <= 0 || (status.position_ms || 0) / duration < 0.5) return;

  let next = status.index + 1;
  if (next >= status.queue_len) {
    if (status.repeat === "all") next = 0;
    else return;
  }
  if (next === status.index) return;

  const item = playerController.queueItems[next];
  if (!item?.uploadId) return;

  if (isCached(item)) {
    playerController.swapQueueToLocal(next, cachePath(item));
    return;
  }
  if (prefetching.has(item.uploadId)) return;

  prefetching.add(item.uploadId);
  try {
    const filePath = await cacheTrack(token, item);
    playerController.swapQueueToLocal(next, filePath);
  } catch {
    // leave it as a stream URL; it will still play
  } finally {
    prefetching.delete(item.uploadId);
  }
}
