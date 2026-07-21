import { RockskyClient } from "client";
import { playerController, type QueueItem } from "./player";
import { cachePath, cacheTrack, isCached } from "./trackCache";

// Resolve each track to a playable entry: the cached local file when present
// (gapless, instant), otherwise a fresh streaming URL. Only fetches a stream
// token when at least one track isn't cached — so resuming a fully-cached queue
// needs no network at all and starts instantly.
async function playableUris(token: string, tracks: QueueItem[]) {
  const client = new RockskyClient(token);
  const needStream = tracks.some((t) => !isCached(t));
  const streamToken = needStream
    ? (await client.getStreamToken()).token
    : "";
  return tracks.map((t) =>
    isCached(t) ? cachePath(t)! : client.streamUrl(t.uploadId, streamToken),
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
  const n = restored.index;
  // Reorder so the resume track is FIRST and play from index 0 — exactly like
  // "play shuffled", which streams reliably. Starting at index N instead relies
  // on skipTo, which races the async stream load and fails on weak links.
  const items = [...restored.items.slice(n), ...restored.items.slice(0, n)];
  const uris = await playableUris(token, items);
  await playerController.playQueue(items, uris, 0);
  // Only seek when the track is a local file — seeking into a live stream
  // stalls on a weak connection (the other reason resume hung on the Pi).
  if (restored.positionMs > 0 && isCached(items[0])) {
    playerController.seekMs(restored.positionMs);
  }
  playerController.restored = null;
}

/** True while a background track download is running (for a buffering hint). */
export function isPrefetching(): boolean {
  return prefetching.size > 0;
}

// Jump to a queue index by rebuilding the queue from our own item mirror,
// REORDERED so the target track is first, and playing from index 0. Starting at
// index N would use skipTo, which races the async stream load and fails on weak
// links (the same reason plain resume/jump broke on the Pi). Cached tracks play
// from disk; the rest stream. Plays immediately — never blocks on a download.
export async function jumpTo(token: string, targetIndex: number) {
  const src = playerController.queueItems;
  if (targetIndex < 0 || targetIndex >= src.length) return;
  const items = [...src.slice(targetIndex), ...src.slice(0, targetIndex)];
  const uris = await playableUris(token, items);
  await playerController.playQueue(items, uris, 0);
}

/** Skip to the next track (rebuilds with cache, so it plays local, no buffer). */
export async function skipNext(token: string) {
  const s = playerController.status();
  if (!s || s.index == null) return;
  const len = playerController.queueItems.length;
  let target = s.index + 1;
  if (target >= len) {
    if (s.repeat === "all") target = 0;
    else return;
  }
  await jumpTo(token, target);
}

/** Skip to the previous track (same reliable rebuild path). */
export async function skipPrev(token: string) {
  const s = playerController.status();
  if (!s || s.index == null) return;
  const len = playerController.queueItems.length;
  let target = s.index - 1;
  if (target < 0) {
    if (s.repeat === "all") target = len - 1;
    else return;
  }
  await jumpTo(token, target);
}

// Runs on a short interval. Once the current track passes the halfway mark it
// downloads the NEXT track to disk and hot-swaps its queue entry to the local
// file, so the transition is gapless / crossfade-ready and there's no wait when
// the track changes.
const prefetching = new Set<string>();

export async function prefetchTick(token: string | undefined) {
  if (!token) return;
  const status = playerController.status();
  if (!status || status.index == null || status.queue_len === 0) return;
  if (status.state !== "playing") return;

  // Start downloading the next track once the current one reaches its halfway
  // point. Use the track's metadata duration (known immediately from the API)
  // rather than the engine's duration_ms, which streams report late or as 0 —
  // that's what made the 50% trigger unreliable on auto-advance. A short time
  // fallback covers the rare case where no duration is known at all.
  const current = playerController.queueItems[status.index];
  const dur = status.duration_ms || current?.duration || 0;
  const pos = status.position_ms || 0;
  const halfway = dur > 0 ? pos >= dur / 2 : pos >= 15_000;
  if (!halfway) return;

  // Only the genuine next track — never the repeat-all wrap back to index 0
  // (swapping a track before the current one would disturb playback).
  const next = status.index + 1;
  if (next >= status.queue_len) return;

  const item = playerController.queueItems[next];
  if (!item?.uploadId) return;

  if (isCached(item)) {
    const p = cachePath(item);
    if (p) playerController.swapQueueToLocal(next, p);
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
