/**
 * Bulk-imports all existing user uploads into the Typesense library_tracks
 * collection. Safe to re-run — uses upsert so already-indexed documents are
 * updated in-place.
 *
 * Usage:
 *   npm run typesense:import
 */
import chalk from "chalk";
import { consola } from "consola";
import { ctx } from "context";
import { count, eq } from "drizzle-orm";
import tables from "schema";
import { indexLibraryTrack } from "typesense/library";
import { ensureCollection } from "typesense/schema";

const BATCH = 100;

async function main() {
  consola.start("Ensuring Typesense collection exists...");
  await ensureCollection();
  consola.success("Collection ready");

  consola.start("Counting uploads...");
  const [{ value: total }] = await ctx.db
    .select({ value: count() })
    .from(tables.userUploads);

  consola.info(`Found ${chalk.bold(total)} uploads to import`);

  if (total === 0) {
    consola.warn("No uploads found — nothing to import.");
    process.exit(0);
  }

  let indexed = 0;
  let failed = 0;
  let offset = 0;

  while (offset < total) {
    consola.info(
      `Fetching batch ${chalk.cyan(offset + 1)}–${chalk.cyan(Math.min(offset + BATCH, total))} of ${chalk.bold(total)}...`,
    );

    const rows = await ctx.db
      .select({
        upload: tables.userUploads,
        track: tables.tracks,
      })
      .from(tables.userUploads)
      .innerJoin(tables.tracks, eq(tables.userUploads.trackId, tables.tracks.id))
      .orderBy(tables.userUploads.uploadedAt)
      .limit(BATCH)
      .offset(offset);

    if (rows.length === 0) {
      consola.warn("Empty batch returned — stopping early.");
      break;
    }

    consola.info(`  Indexing ${rows.length} documents...`);

    const results = await Promise.allSettled(
      rows.map(({ upload, track }) =>
        indexLibraryTrack({
          id: upload.id,
          user_id: upload.userId,
          track_id: track.id,
          title: track.title,
          artist: track.artist,
          album: track.album,
          album_artist: track.albumArtist ?? track.artist,
          genre: track.genre ?? undefined,
          composer: track.composer ?? undefined,
          year: track.year ?? undefined,
          duration: track.duration,
          album_art: track.albumArt ?? undefined,
          r2_key: upload.r2Key,
          mime_type: upload.mimeType,
          file_size: upload.fileSize,
          original_filename: upload.originalFilename ?? undefined,
          uploaded_at: upload.uploadedAt.getTime(),
          mb_id: track.mbId ?? undefined,
          track_number: track.trackNumber ?? undefined,
          disc_number: track.discNumber ?? undefined,
        }),
      ),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const { upload, track } = rows[i];
      if (result.status === "rejected") {
        failed++;
        consola.warn(
          `  Failed to index "${track.title}" (upload ${upload.id}): ${result.reason}`,
        );
      } else {
        indexed++;
        consola.debug(`  ✓ ${track.title} — ${track.artist}`);
      }
    }

    const pct = Math.round((Math.min(offset + BATCH, total) / total) * 100);
    consola.success(
      `Batch done — ${chalk.green(indexed)} indexed, ${chalk.red(failed)} failed [${pct}%]`,
    );

    offset += BATCH;
  }

  consola.success(
    chalk.green(`Import complete — ${chalk.bold(indexed)} indexed, ${chalk.bold(failed)} failed out of ${chalk.bold(total)} uploads.`),
  );
  process.exit(failed > 0 ? 1 : 0);
}

await main();
