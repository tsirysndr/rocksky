import { RockskyClient } from "client";
import envpaths from "env-paths";
import fs from "fs";
import path from "path";
import { getCreds, streamUrl as navidromeStreamUrl } from "./navidrome";
import type { QueueItem } from "./player";

const CACHE_DIR = path.join(envpaths("rocksky", { suffix: "" }).cache, "tracks");
const MAX_CACHE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

const EXT: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "application/ogg": "ogg",
  "audio/opus": "opus",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
};

function extFor(item: QueueItem): string {
  return (item.mimeType && EXT[item.mimeType.toLowerCase()]) || "mp3";
}

export function cacheDir(): string {
  return CACHE_DIR;
}

// Stable cache key. Uploads are keyed by uploadId; playlist / favorites tracks
// stream via Navidrome and carry only a trackId (uploadId is "").
export function cacheId(item: QueueItem): string {
  return item.uploadId || item.trackId || "";
}

// The on-disk cache file for `id`, whatever its extension — the mimeType (and
// therefore the predicted extension) is unknown for Navidrome / session-restored
// tracks, so lookups must match by id alone.
function findOnDisk(id: string): string | null {
  if (!id) return null;
  try {
    for (const f of fs.readdirSync(CACHE_DIR)) {
      if (f.endsWith(".part")) continue;
      const dot = f.lastIndexOf(".");
      if ((dot > 0 ? f.slice(0, dot) : f) === id) {
        return path.join(CACHE_DIR, f);
      }
    }
  } catch {
    // cache dir missing
  }
  return null;
}

/** Local path where `item` is cached, or null when it isn't. */
export function cachePath(item: QueueItem): string | null {
  return findOnDisk(cacheId(item));
}

export function isCached(item: QueueItem): boolean {
  return cachePath(item) !== null;
}

const inflight = new Map<string, Promise<string>>();

/** Download `item` to the cache (once), returning the local path. */
export function cacheTrack(token: string, item: QueueItem): Promise<string> {
  const id = cacheId(item);
  if (!id) return Promise.reject(new Error("not cacheable: no upload/track id"));
  const cached = findOnDisk(id);
  if (cached) return Promise.resolve(cached);

  const existing = inflight.get(id);
  if (existing) return existing;

  const job = (async () => {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    let url: string;
    if (item.uploadId) {
      const client = new RockskyClient(token);
      const { token: streamToken } = await client.getStreamToken();
      url = client.streamUrl(item.uploadId, streamToken);
    } else {
      // Playlist / favorites track — stream via the Navidrome API by trackId.
      const creds = await getCreds(token);
      if (!creds) throw new Error("no Navidrome credentials");
      url = navidromeStreamUrl(creds, item.trackId!);
    }

    // Abort the download if it stalls, so a flaky connection can't hang the
    // prefetch forever (it will simply be retried on a later tick).
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    const tmp = path.join(CACHE_DIR, `${id}.part`);
    let dest: string;
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok || !res.body) {
        throw new Error(`cache download failed: ${res.status}`);
      }
      // Name the file by the served Content-Type when the item's mimeType is
      // unknown (Navidrome tracks), so the decoder sees the right extension.
      const served = res.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase();
      const ext =
        (item.mimeType && EXT[item.mimeType.toLowerCase()]) ||
        (served && EXT[served]) ||
        extFor(item);
      dest = path.join(CACHE_DIR, `${id}.${ext}`);
      // Stream straight to disk instead of buffering the whole track in RAM —
      // critical on low-memory devices (e.g. an Orange Pi Zero with 1 GB).
      const { Readable } = await import("node:stream");
      const { pipeline } = await import("node:stream/promises");
      await pipeline(
        Readable.fromWeb(res.body as any),
        fs.createWriteStream(tmp),
      );
    } catch (e) {
      try {
        fs.rmSync(tmp, { force: true });
      } catch {}
      throw e;
    } finally {
      clearTimeout(timeout);
    }
    fs.renameSync(tmp, dest);
    pruneCache();
    return dest;
  })().finally(() => inflight.delete(id));

  inflight.set(id, job);
  return job;
}

export interface CacheStats {
  files: number;
  bytes: number;
}

export function cacheStats(): CacheStats {
  try {
    const files = fs
      .readdirSync(CACHE_DIR)
      .filter((f) => !f.endsWith(".part"));
    let bytes = 0;
    for (const f of files) bytes += fs.statSync(path.join(CACHE_DIR, f)).size;
    return { files: files.length, bytes };
  } catch {
    return { files: 0, bytes: 0 };
  }
}

export function clearCache(): void {
  try {
    for (const f of fs.readdirSync(CACHE_DIR)) {
      fs.rmSync(path.join(CACHE_DIR, f), { force: true });
    }
  } catch {
    // ignore
  }
}

// Evict the oldest files once the cache grows past its size cap.
function pruneCache(): void {
  try {
    const files = fs
      .readdirSync(CACHE_DIR)
      .filter((f) => !f.endsWith(".part"))
      .map((f) => {
        const p = path.join(CACHE_DIR, f);
        const s = fs.statSync(p);
        return { p, size: s.size, mtime: s.mtimeMs };
      });
    let total = files.reduce((a, b) => a + b.size, 0);
    if (total <= MAX_CACHE_BYTES) return;
    files.sort((a, b) => a.mtime - b.mtime);
    for (const f of files) {
      if (total <= MAX_CACHE_BYTES) break;
      fs.rmSync(f.p, { force: true });
      total -= f.size;
    }
  } catch {
    // ignore
  }
}
