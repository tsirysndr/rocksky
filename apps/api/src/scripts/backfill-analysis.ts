/**
 * Fill tracks.key / tracks.bpm for already-uploaded tracks.
 *
 * Walks every track that has an upload and is missing a key or a bpm,
 * downloads the audio, and analyzes it with the @rocksky/analysis native
 * binding. Batches fan out across all cores on the Rust side (rayon), so a
 * batch of N costs roughly one track's decode time per core. Results are
 * coalesce-written: a value that is already set is never overwritten.
 *
 * Progress is logged per track as it completes —
 *   ✔ [  12/480   2.5%]  Fm    124.0 bpm  Title — Artist
 * with a rate + ETA line after each batch and a final summary.
 *
 * Usage (also wired as `bun backfill:analysis`):
 *   tsx ./src/scripts/backfill-analysis.ts
 *
 * Env:
 *   BACKFILL_BATCH_SIZE    tracks analyzed per parallel batch (default 8)
 *   BACKFILL_LIMIT         stop after this many analyzed tracks (default: all)
 *   BACKFILL_USER_ID       only tracks uploaded by this user
 *   BACKFILL_DRY_RUN       "1" — analyze and report, write nothing
 */

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { consola } from "consola";
import { ctx } from "context";
import { and, asc, eq, gt, isNull, or, sql } from "drizzle-orm";
import tables from "schema";
import { resolveStorageClient } from "storage/app";
import { loadAnalysisModule, storeTrackAnalysis } from "uploads/analysis";

const BATCH_SIZE = Number(process.env.BACKFILL_BATCH_SIZE ?? 8);
const LIMIT = process.env.BACKFILL_LIMIT
  ? Number(process.env.BACKFILL_LIMIT)
  : Number.POSITIVE_INFINITY;
const USER_ID = process.env.BACKFILL_USER_ID || null;
const DRY_RUN = process.env.BACKFILL_DRY_RUN === "1";
const DOWNLOAD_TIMEOUT_MS = Number(
  process.env.BACKFILL_DOWNLOAD_TIMEOUT_MS ?? 90_000,
);

const MIME_TO_EXT: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/flac": "flac",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/aiff": "aiff",
  "audio/x-aiff": "aiff",
};

const needsAnalysis = or(isNull(tables.tracks.key), isNull(tables.tracks.bpm));

// One S3 client per storage target for the whole run. A fresh client per
// download is a leak: its keep-alive sockets are live handles that root the
// client, so hundreds of them pile up faster than the sockets idle out.
const storageClients = new Map<string, ReturnType<typeof resolveStorageClient>>();
function storageFor(userId: string, providerId: string | null) {
  const key = providerId ? `${userId}:${providerId}` : "managed";
  let client = storageClients.get(key);
  if (!client) {
    client = resolveStorageClient(userId, providerId);
    storageClients.set(key, client);
  }
  return client;
}

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m${String(s).padStart(2, "0")}s` : `${s}s`;
}

function progressTag(done: number, total: number): string {
  const width = String(total).length;
  const pct = total > 0 ? ((done / total) * 100).toFixed(1) : "0.0";
  return `[${String(done).padStart(width)}/${total} ${pct.padStart(5)}%]`;
}

async function main() {
  const analysis = await loadAnalysisModule();
  if (!analysis) {
    consola.error(
      "@rocksky/analysis native binding is not built — run `bun run build` in crates/analysis-node first",
    );
    process.exit(1);
  }

  const filters = and(
    needsAnalysis,
    ...(USER_ID ? [eq(tables.userUploads.userId, USER_ID)] : []),
  );

  const [{ total }] = await ctx.db
    .select({
      total: sql<number>`count(distinct ${tables.tracks.id})::int`,
    })
    .from(tables.userUploads)
    .innerJoin(tables.tracks, eq(tables.userUploads.trackId, tables.tracks.id))
    .where(filters);

  const target = Math.min(total, LIMIT);
  consola.info(
    `${total} uploaded track(s) missing key/bpm${
      Number.isFinite(LIMIT) ? `, limited to ${target}` : ""
    }${DRY_RUN ? " — DRY RUN, nothing will be written" : ""}`,
  );
  if (target === 0) process.exit(0);

  const startedAt = Date.now();
  const seenTracks = new Set<string>();
  let cursor = "";
  let processed = 0;
  let filled = 0;
  let failed = 0;
  let downloadFailed = 0;

  while (processed < target) {
    // One page of uploads whose track still lacks a key or bpm. The page is
    // larger than the batch because several uploads can share one track.
    const rows = await ctx.db
      .select({
        uploadId: tables.userUploads.id,
        r2Key: tables.userUploads.r2Key,
        mimeType: tables.userUploads.mimeType,
        userId: tables.userUploads.userId,
        storageProviderId: tables.userUploads.storageProviderId,
        trackId: tables.tracks.id,
        title: tables.tracks.title,
        artist: tables.tracks.artist,
      })
      .from(tables.userUploads)
      .innerJoin(
        tables.tracks,
        eq(tables.userUploads.trackId, tables.tracks.id),
      )
      .where(and(gt(tables.userUploads.id, cursor), filters))
      .orderBy(asc(tables.userUploads.id))
      .limit(BATCH_SIZE * 4);
    if (rows.length === 0) break;

    // Consume rows in order until the batch is full, and advance the cursor
    // only past what was consumed — moving it past the whole page would
    // silently skip every row the batch had no room for.
    const capacity = Math.min(BATCH_SIZE, target - processed);
    const batch: typeof rows = [];
    let consumed = 0;
    for (const row of rows) {
      if (batch.length >= capacity) break;
      consumed++;
      if (seenTracks.has(row.trackId)) continue;
      seenTracks.add(row.trackId);
      batch.push(row);
    }
    cursor = rows[consumed - 1]?.uploadId ?? rows[rows.length - 1].uploadId;
    if (batch.length === 0) continue;

    // Download the whole batch concurrently, then hand it to Rust in one go.
    consola.info(`downloading ${batch.length} file(s)…`);
    const downloads = await Promise.all(
      batch.map(async (row) => {
        // The SDK has no default socket timeout, so a stalled connection
        // would hang the whole run — abort covers headers AND body read.
        const controller = new AbortController();
        const timer = setTimeout(
          () => controller.abort(),
          DOWNLOAD_TIMEOUT_MS,
        );
        try {
          const { client, bucket } = await storageFor(
            row.userId,
            row.storageProviderId,
          );
          const obj = await client.send(
            new GetObjectCommand({ Bucket: bucket, Key: row.r2Key }),
            { abortSignal: controller.signal },
          );
          const buffer = Buffer.from(await obj.Body!.transformToByteArray());
          return { row, buffer };
        } catch (e) {
          downloadFailed++;
          consola.warn(`✖ download failed ${row.r2Key}:`, e);
          return null;
        } finally {
          clearTimeout(timer);
        }
      }),
    );
    const items = downloads.filter((d) => d !== null);
    if (items.length === 0) continue;

    const byTrackId = new Map(items.map(({ row }) => [row.trackId, row]));
    const batchStart = processed;

    const results = await analysis.analyzeBatch(
      items.map(({ row, buffer }) => ({
        id: row.trackId,
        buffer,
        extensionHint: MIME_TO_EXT[row.mimeType],
      })),
      (p) => {
        const row = p.id ? byTrackId.get(p.id) : undefined;
        const label = row ? `${row.title} — ${row.artist}` : (p.id ?? "?");
        const tag = progressTag(batchStart + p.completed, target);
        if (p.ok) {
          consola.info(
            `✔ ${tag} ${(p.key ?? "?").padEnd(4)} ${
              p.bpm != null ? `${p.bpm.toFixed(1).padStart(5)} bpm` : "    ? bpm"
            }  ${label}`,
          );
        } else {
          consola.warn(`✖ ${tag} ${label}: ${p.error}`);
        }
      },
    );

    for (const result of results) {
      processed++;
      const ok =
        result.ok &&
        (result.analysis?.key != null || result.analysis?.bpm != null);
      if (!ok) {
        failed++;
        continue;
      }
      if (!DRY_RUN) {
        await storeTrackAnalysis(
          result.id!,
          result.analysis!.key,
          result.analysis!.bpm,
        );
      }
      filled++;
    }

    const elapsed = (Date.now() - startedAt) / 1000;
    const rate = processed / elapsed;
    const eta = rate > 0 ? (target - processed) / rate : Number.NaN;
    consola.info(
      `progress: ${processed}/${target} analyzed · ${filled} filled · ${failed} without result · ${downloadFailed} download failure(s) · ${rate.toFixed(2)} tracks/s · ETA ${formatEta(eta)}`,
    );
  }

  const elapsed = (Date.now() - startedAt) / 1000;
  consola.success(
    `done in ${formatEta(elapsed)}: ${processed} analyzed, ${filled} filled, ${failed} without result, ${downloadFailed} download failure(s)${DRY_RUN ? " (dry run — nothing written)" : ""}`,
  );
  process.exit(0);
}

main().catch((e) => {
  consola.error(e);
  process.exit(1);
});
