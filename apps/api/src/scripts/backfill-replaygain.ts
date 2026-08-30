/**
 * Add ReplayGain tags to already-uploaded library files.
 *
 * The desktop/wasm players apply ReplayGain from tags embedded in the audio
 * stream; uploads made before upload-time tagging existed (uploads/replaygain.ts)
 * have none, so loud masters play saturated no matter the user's setting.
 *
 * Walks user_uploads rows on managed storage (storage_provider_id IS NULL —
 * BYO buckets are the user's own and are left untouched), downloads each
 * object, skips files that already carry REPLAYGAIN_TRACK_GAIN, analyzes the
 * rest with ffmpeg and rewrites the object in place (same key) with the tags
 * added. file_size is updated to the retagged length.
 *
 * Usage (also wired as `bun backfill:replaygain`):
 *   tsx ./src/scripts/backfill-replaygain.ts
 *
 * Env:
 *   BACKFILL_PAGE_SIZE     rows fetched per DB page (default 100)
 *   BACKFILL_LIMIT         stop after this many tagged files (default: all)
 *   BACKFILL_USER_ID       only this user's uploads
 *   BACKFILL_DRY_RUN       "1" — analyze and report, write nothing
 *   FFMPEG_PATH            ffmpeg binary (default "ffmpeg" on PATH)
 */

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { consola } from "consola";
import { ctx } from "context";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { env } from "lib/env";
import { parseBuffer } from "music-metadata";
import tables from "schema";
import { REPLAYGAIN_EXTS, ensureReplayGain } from "uploads/replaygain";

const PAGE_SIZE = Number(process.env.BACKFILL_PAGE_SIZE ?? 100);
const LIMIT = process.env.BACKFILL_LIMIT
  ? Number(process.env.BACKFILL_LIMIT)
  : Number.POSITIVE_INFINITY;
const USER_ID = process.env.BACKFILL_USER_ID || null;
const DRY_RUN = process.env.BACKFILL_DRY_RUN === "1";

const MIME_TO_EXT: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/flac": "flac",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/ogg": "ogg",
};

const s3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
});

async function main() {
  let cursor = "";
  let scanned = 0;
  let tagged = 0;
  let skipped = 0;
  let failed = 0;

  while (tagged < LIMIT) {
    const rows = await ctx.db
      .select()
      .from(tables.userUploads)
      .where(
        and(
          gt(tables.userUploads.id, cursor),
          isNull(tables.userUploads.storageProviderId),
          ...(USER_ID ? [eq(tables.userUploads.userId, USER_ID)] : []),
        ),
      )
      .orderBy(asc(tables.userUploads.id))
      .limit(PAGE_SIZE);
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;

    for (const row of rows) {
      if (tagged >= LIMIT) break;
      scanned++;
      const ext = MIME_TO_EXT[row.mimeType];
      if (!ext || !REPLAYGAIN_EXTS.has(ext)) {
        skipped++;
        continue;
      }

      try {
        const obj = await s3.send(
          new GetObjectCommand({ Bucket: env.S3_BUCKET_NAME, Key: row.r2Key }),
        );
        const buf = Buffer.from(await obj.Body!.transformToByteArray());

        const meta = await parseBuffer(buf, { mimeType: row.mimeType });
        if (meta.common.replaygain_track_gain?.dB != null) {
          skipped++;
          continue;
        }

        if (DRY_RUN) {
          consola.info(`[dry-run] would tag ${row.r2Key}`);
          tagged++;
          continue;
        }

        const taggedBuf = await ensureReplayGain(buf, ext);
        if (taggedBuf === buf) {
          failed++;
          consola.warn(`analysis failed: ${row.r2Key}`);
          continue;
        }

        await s3.send(
          new PutObjectCommand({
            Bucket: env.S3_BUCKET_NAME,
            Key: row.r2Key,
            Body: taggedBuf,
            ContentType: row.mimeType,
            ContentLength: taggedBuf.length,
          }),
        );
        await ctx.db
          .update(tables.userUploads)
          .set({ fileSize: taggedBuf.length })
          .where(eq(tables.userUploads.id, row.id));
        tagged++;
        consola.success(`tagged ${row.r2Key}`);
      } catch (e) {
        failed++;
        consola.warn(`failed ${row.r2Key}:`, e);
      }
    }
    consola.info(
      `progress: scanned=${scanned} tagged=${tagged} skipped=${skipped} failed=${failed}`,
    );
  }

  consola.info(
    `done: scanned=${scanned} tagged=${tagged} skipped=${skipped} failed=${failed}`,
  );
  process.exit(0);
}

main().catch((e) => {
  consola.error(e);
  process.exit(1);
});
