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
  // Play immediately: cached tracks play from disk, the rest stream over HTTP —
  // rockbox starts as soon as it has buffered enough, so there's no wait for a
  // full download (which is painful on large files). We deliberately do NOT
  // kick off a cache download here: downloading a track while it's streaming is
  // the double-bandwidth that caused dropouts. Caching happens opportunistically
  // in prefetchTick, and only while the current track plays from a local file.
  await playerController.playQueue(tracks, await playableUris(token, tracks), index);
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

/** True while a background track download is running (for a buffering hint). */
export function isPrefetching(): boolean {
  return prefetching.size > 0;
}

// Runs on a short interval. Downloads the NEXT track to disk while the current
// one plays, then hot-swaps its queue entry to the local file (gapless /
// crossfade-ready). Crucially, it only downloads while the current track is
// playing from a LOCAL file — never while a track is streaming — so we never
// contend for bandwidth with the audio you're hearing. That single rule is what
// keeps playback smooth on weak connections / SBCs.
const prefetching = new Set<string>();

export async function prefetchTick(token: string | undefined) {
  if (!token) return;
  const status = playerController.status();
  if (!status || status.index == null || status.queue_len === 0) return;
  if (status.state !== "playing") return;

  // Only pull the next track while the CURRENT one is playing from a local
  // file — otherwise we'd be downloading while streaming (the double-bandwidth
  // that causes dropouts). No dependency on duration_ms (which streams report
  // late, especially on Linux).
  const current = playerController.queueItems[status.index];
  if (!current || !isCached(current)) return;
  if ((status.position_ms || 0) < 2000) return;

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
    // network / disk hiccup — retried on a later tick
  } finally {
    prefetching.delete(item.uploadId);
  }
}
