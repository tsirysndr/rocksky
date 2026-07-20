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

// Precache the next track once the current one passes the halfway point, then
// hot-swap its queue entry to the local file for gapless playback.
const prefetching = new Set<number>();
export async function prefetchTick(token: string | undefined) {
  if (!token) return;
  const status = playerController.status();
  if (!status || status.index == null || status.queue_len === 0) return;

  const duration = status.duration_ms || 0;
  if (duration <= 0 || (status.position_ms || 0) / duration < 0.5) return;

  let next = status.index + 1;
  if (next >= status.queue_len) {
    if (status.repeat === "all") next = 0;
    else return;
  }
  if (next === status.index) return;

  const item = playerController.queueItems[next];
  if (!item?.uploadId || prefetching.has(next)) return;

  // When crossfade is active the engine pre-buffers the next entry to blend it;
  // hot-swapping that entry would break the crossfade. So only swap the live
  // queue entry to the local file when crossfade is off — but still download to
  // cache either way, so future plays are instant.
  const canSwap = playerController.sound.crossfade === 0;

  if (isCached(item)) {
    if (canSwap) playerController.swapQueueToLocal(next, cachePath(item));
    return;
  }

  prefetching.add(next);
  try {
    const filePath = await cacheTrack(token, item);
    if (canSwap) playerController.swapQueueToLocal(next, filePath);
  } catch {
    // leave it as a stream URL; it will still play
  } finally {
    prefetching.delete(next);
  }
}
