/**
 * Bulk-imports rows into Typesense.
 *
 * - Always imports the search collections (albums, artists, tracks, users, playlists)
 *   used by `app.rocksky.feed.search`.
 * - With `--library`, also re-imports the user-upload library_tracks collection
 *   (the per-user library search index).
 *
 * Safe to re-run — all imports use `action: upsert` so already-indexed documents
 * are updated in-place.
 *
 * Usage:
 *   npm run typesense:import                 # search collections only
 *   npm run typesense:import -- --library    # search + library_tracks
 *   npm run typesense:import -- --only library
 *   npm run typesense:import -- --reset      # drop & recreate search collections first
 */
import chalk from "chalk";
import { consola } from "consola";
import { ctx } from "context";
import { count, eq } from "drizzle-orm";
import tables from "schema";
import { indexLibraryTrack } from "typesense/library";
import {
  ensureCollection,
  ensureSearchCollections,
  recreateSearchCollections,
} from "typesense/schema";
import {
  indexAlbums,
  indexArtists,
  indexPlaylists,
  indexTracks,
  indexUsers,
} from "typesense/search";

const BATCH = 500;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const optValue = (name: string): string | undefined => {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
};

const only = optValue("only");
const includeLibrary = flag("library") || only === "library";
const includeSearch = only !== "library";
const reset = flag("reset");

async function main() {
  if (includeSearch) {
    if (reset) {
      consola.start("Recreating Typesense search collections...");
      await recreateSearchCollections();
    } else {
      consola.start("Ensuring Typesense search collections exist...");
      await ensureSearchCollections();
    }
    consola.success("Search collections ready");

    await importAlbums();
    await importArtists();
    await importTracks();
    await importUsers();
    await importPlaylists();
  }

  if (includeLibrary) {
    consola.start("Ensuring library_tracks collection exists...");
    await ensureCollection();
    consola.success("library_tracks collection ready");
    await importLibraryTracks();
  }

  consola.success(chalk.green("Typesense import complete."));
  process.exit(0);
}

async function importCollection<T>(opts: {
  label: string;
  total: number;
  fetch: (offset: number, limit: number) => Promise<T[]>;
  index: (rows: T[]) => Promise<void>;
}) {
  const { label, total, fetch, index } = opts;
  consola.info(`Importing ${chalk.bold(total)} ${chalk.cyan(label)}`);
  if (total === 0) return;

  let imported = 0;
  let failed = 0;
  for (let offset = 0; offset < total; offset += BATCH) {
    const rows = await fetch(offset, BATCH);
    if (rows.length === 0) break;

    try {
      await index(rows);
      imported += rows.length;
    } catch (err) {
      failed += rows.length;
      consola.warn(`  Batch failed at offset ${offset}: ${err}`);
    }

    const done = Math.min(offset + rows.length, total);
    const pct = Math.round((done / total) * 100);
    consola.info(
      `  ${chalk.cyan(label)} ${done}/${total} [${pct}%] — ${chalk.green(imported)} ok, ${chalk.red(failed)} failed`,
    );
  }
  consola.success(
    `${chalk.cyan(label)}: ${chalk.green(imported)} imported, ${chalk.red(failed)} failed`,
  );
}

async function importAlbums() {
  const [{ value: total }] = await ctx.db
    .select({ value: count() })
    .from(tables.albums);
  await importCollection({
    label: "albums",
    total,
    fetch: (offset, limit) =>
      ctx.db.select().from(tables.albums).limit(limit).offset(offset),
    index: indexAlbums,
  });
}

async function importArtists() {
  const [{ value: total }] = await ctx.db
    .select({ value: count() })
    .from(tables.artists);
  await importCollection({
    label: "artists",
    total,
    fetch: (offset, limit) =>
      ctx.db.select().from(tables.artists).limit(limit).offset(offset),
    index: indexArtists,
  });
}

async function importTracks() {
  const [{ value: total }] = await ctx.db
    .select({ value: count() })
    .from(tables.tracks);
  await importCollection({
    label: "tracks",
    total,
    fetch: (offset, limit) =>
      ctx.db.select().from(tables.tracks).limit(limit).offset(offset),
    index: indexTracks,
  });
}

async function importUsers() {
  const [{ value: total }] = await ctx.db
    .select({ value: count() })
    .from(tables.users);
  await importCollection({
    label: "users",
    total,
    fetch: (offset, limit) =>
      ctx.db.select().from(tables.users).limit(limit).offset(offset),
    index: indexUsers,
  });
}

async function importPlaylists() {
  const [{ value: total }] = await ctx.db
    .select({ value: count() })
    .from(tables.playlists);
  await importCollection({
    label: "playlists",
    total,
    fetch: (offset, limit) =>
      ctx.db.select().from(tables.playlists).limit(limit).offset(offset),
    index: indexPlaylists,
  });
}

async function importLibraryTracks() {
  consola.start("Counting uploads...");
  const [{ value: total }] = await ctx.db
    .select({ value: count() })
    .from(tables.userUploads);

  consola.info(`Found ${chalk.bold(total)} uploads to import`);
  if (total === 0) return;

  let indexed = 0;
  let failed = 0;
  for (let offset = 0; offset < total; offset += BATCH) {
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

    if (rows.length === 0) break;

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

    for (const r of results) {
      if (r.status === "rejected") failed++;
      else indexed++;
    }

    const done = Math.min(offset + rows.length, total);
    const pct = Math.round((done / total) * 100);
    consola.info(
      `  ${chalk.cyan("library_tracks")} ${done}/${total} [${pct}%] — ${chalk.green(indexed)} ok, ${chalk.red(failed)} failed`,
    );
  }

  consola.success(
    `${chalk.cyan("library_tracks")}: ${chalk.green(indexed)} indexed, ${chalk.red(failed)} failed`,
  );
}

await main();
