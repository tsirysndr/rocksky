/**
 * Bulk-imports all existing user uploads into the Typesense library_tracks
 * collection. Safe to re-run — uses upsert so already-indexed documents are
 * updated in-place.
 *
 * Usage:
 *   npx tsx src/scripts/typesense-import.ts
 */
import chalk from "chalk";
import { consola } from "consola";
import { ctx } from "context";
import { eq } from "drizzle-orm";
import tables from "schema";
import { indexLibraryTrack } from "typesense/library";
import { ensureCollection } from "typesense/schema";

const BATCH = 100;

async function main() {
  consola.info(chalk.cyan("Ensuring Typesense collection exists..."));
  await ensureCollection();

  const total = await ctx.db
    .select({ count: ctx.db.$count(tables.userUploads) })
    .then(([r]) => Number(r.count));

  consola.info(
    chalk.cyan(`Importing ${chalk.bold(total)} uploads into Typesense...`),
  );

  let indexed = 0;
  let offset = 0;

  while (offset < total) {
    const rows = await ctx.db
      .select({
        upload: tables.userUploads,
        track: tables.tracks,
      })
      .from(tables.userUploads)
      .innerJoin(
        tables.tracks,
        eq(tables.userUploads.trackId, tables.tracks.id),
      )
      .orderBy(tables.userUploads.uploadedAt)
      .limit(BATCH)
      .offset(offset);

    await Promise.all(
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
        }).catch((e) =>
          consola.warn(
            `[typesense] failed to index upload ${upload.id}:`,
            e,
          ),
        ),
      ),
    );

    indexed += rows.length;
    offset += BATCH;
    consola.info(
      chalk.gray(`  ${indexed}/${total} (${Math.round((indexed / total) * 100)}%)`),
    );
  }

  consola.info(chalk.green(`Done — indexed ${indexed} uploads.`));
  process.exit(0);
}

await main();
