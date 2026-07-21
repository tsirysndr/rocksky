import { RockskyClient } from "client";
import envpaths from "env-paths";
import fs from "fs";
import path from "path";
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

/** Local path where `item` is (or would be) cached — keyed by uploadId. */
export function cachePath(item: QueueItem): string {
  return path.join(CACHE_DIR, `${item.uploadId}.${extFor(item)}`);
}

export function isCached(item: QueueItem): boolean {
  try {
    return !!item.uploadId && fs.existsSync(cachePath(item));
  } catch {
    return false;
  }
}

const inflight = new Map<string, Promise<string>>();

/** Download `item` to the cache (once), returning the local path. */
export function cacheTrack(token: string, item: QueueItem): Promise<string> {
  if (!item.uploadId) return Promise.reject(new Error("no uploadId"));
  const dest = cachePath(item);
  if (fs.existsSync(dest)) return Promise.resolve(dest);

  const existing = inflight.get(item.uploadId);
  if (existing) return existing;

  const job = (async () => {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const client = new RockskyClient(token);
    const { token: streamToken } = await client.getStreamToken();

    // Abort the download if it stalls, so a flaky connection can't hang the
    // prefetch forever (it will simply be retried on a later tick).
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    const tmp = `${dest}.part`;
    try {
      const res = await fetch(client.streamUrl(item.uploadId, streamToken), {
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`cache download failed: ${res.status}`);
      }
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
  })().finally(() => inflight.delete(item.uploadId));

  inflight.set(item.uploadId, job);
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
