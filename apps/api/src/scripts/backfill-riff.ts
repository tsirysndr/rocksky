/**
 * Complete missing catalog metadata from riff — the local Spotify catalog API
 * served out of the Parquet dump (see riff/README.md).
 *
 * Walks, in pages:
 *   - tracks  where duration = 0, album_art IS NULL, or album_art still points
 *             at https://cdn.rocksky.app
 *   - albums  where album_art IS NULL or album_art points at cdn.rocksky.app
 *   - artists where picture IS NULL
 *
 * For each row it resolves the Spotify object — by the stored spotify_link id
 * when there is one, otherwise by riff's exact-match search on title/name and
 * artist — and fills every field riff can answer, never overwriting a value
 * that is already present (except the cdn.rocksky.app album-art replacement,
 * which is the point):
 *
 *   tracks:  duration, album_art, isrc, track_number, disc_number, spotify_link
 *   albums:  album_art, release_date, year, spotify_link
 *   artists: picture, genres, spotify_link
 *
 * riff is unrate-limited on loopback, so the only pacing here is the worker
 * count. Misses are just skipped — riff mirrors a dump; whatever it lacks can
 * stay for a rerun after the next dump refresh.
 *
 * Usage (also wired as `bun riff:backfill`):
 *   tsx ./src/scripts/backfill-riff.ts
 *
 * Env:
 *   RIFF_API_URL           riff base URL (default http://localhost:8092/v1)
 *   BACKFILL_PAGE_SIZE     rows fetched per DB page (default 500)
 *   BACKFILL_CONCURRENCY   parallel workers (default 4)
 *   BACKFILL_LIMIT         stop after this many rows per entity (default: all)
 *   BACKFILL_ONLY          "tracks" | "albums" | "artists" | "all" (default all)
 *   BACKFILL_DRY_RUN       "1" — resolve and report, write nothing
 */

import chalk from "chalk";
import { consola } from "consola";
import { ctx } from "context";
import { and, eq, gt, isNull, like, or } from "drizzle-orm";
import tables from "schema";

const RIFF_API_URL = (
  process.env.RIFF_API_URL ?? "http://localhost:8092/v1"
).replace(/\/$/, "");
const PAGE_SIZE = Number(process.env.BACKFILL_PAGE_SIZE ?? 500);
const CONCURRENCY = Number(process.env.BACKFILL_CONCURRENCY ?? 4);
const LIMIT = process.env.BACKFILL_LIMIT
  ? Number(process.env.BACKFILL_LIMIT)
  : Number.POSITIVE_INFINITY;
const ONLY = (process.env.BACKFILL_ONLY ?? "all").toLowerCase();
const DRY_RUN = process.env.BACKFILL_DRY_RUN === "1";

/** Album art still hosted by us; to be replaced by Spotify's CDN URL. */
const ROCKSKY_CDN_PREFIX = "https://cdn.rocksky.app";

const stats = {
  scanned: 0,
  updated: 0,
  artReplaced: 0,
  missed: 0,
  errors: 0,
};

// ---------------------------------------------------------------- riff client

type RiffImage = { url: string; width: number | null; height: number | null };
type RiffArtistRef = { id: string; name: string };
type RiffAlbum = {
  id: string;
  name: string;
  images: RiffImage[];
  release_date: string;
  release_date_precision: string;
  artists: RiffArtistRef[];
  external_urls: { spotify: string };
};
type RiffTrack = {
  id: string;
  name: string;
  duration_ms: number;
  track_number: number;
  disc_number: number;
  external_ids?: { isrc?: string };
  external_urls: { spotify: string };
  album: RiffAlbum;
  artists: RiffArtistRef[];
};
type RiffArtist = {
  id: string;
  name: string;
  images: RiffImage[];
  genres: string[];
  external_urls: { spotify: string };
};

async function riff<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${RIFF_API_URL}${path}`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null; // 404 = riff does not have it; a rerun may.
    return (await res.json()) as T;
  } catch (e) {
    stats.errors += 1;
    consola.warn(`riff request failed: ${path}: ${e}`);
    return null;
  }
}

/**
 * Widest image first is riff's (and Spotify's) order; [0] is "the" art.
 * Never returns one of our own CDN URLs — the goal is Spotify's.
 */
function bestImage(images: RiffImage[] | undefined): string | null {
  const url = images?.[0]?.url;
  return url && !url.startsWith(ROCKSKY_CDN_PREFIX) ? url : null;
}

function spotifyIdFromLink(link: string | null, kind: string): string | null {
  if (!link) return null;
  const m = link.match(
    new RegExp(`open\\.spotify\\.com/${kind}/([A-Za-z0-9]+)`),
  );
  return m ? m[1] : null;
}

/** The primary artist, for search: "A, B & C" carries the primary first. */
function primaryArtist(artist: string): string {
  return artist.split(/,|\sfeat\.?\s|\sft\.?\s|\s&\s/i)[0].trim();
}

// riff answers are memoized per (kind, key): thousands of tracks share the
// same album and artist, and each riff call — cheap as it is — is still a call.
const memo = new Map<string, unknown>();
async function memoized<T>(
  key: string,
  f: () => Promise<T | null>,
): Promise<T | null> {
  if (memo.has(key)) return memo.get(key) as T | null;
  const v = await f();
  memo.set(key, v);
  return v;
}

async function findTrack(
  title: string,
  artist: string,
  spotifyLink: string | null,
): Promise<RiffTrack | null> {
  const id = spotifyIdFromLink(spotifyLink, "track");
  if (id) {
    const hit = await memoized(`track:${id}`, () =>
      riff<RiffTrack>(`/tracks/${id}`),
    );
    if (hit) return hit;
  }
  const q = `track:"${title}" artist:"${primaryArtist(artist)}"`;
  return memoized(`tracksearch:${q.toLowerCase()}`, async () => {
    const res = await riff<{ tracks: { items: RiffTrack[] } }>(
      `/search?type=track&q=${encodeURIComponent(q)}`,
    );
    return res?.tracks?.items?.[0] ?? null;
  });
}

async function findAlbum(
  title: string,
  artist: string,
  spotifyLink: string | null,
): Promise<RiffAlbum | null> {
  const id = spotifyIdFromLink(spotifyLink, "album");
  if (id) {
    const hit = await memoized(`album:${id}`, () =>
      riff<RiffAlbum>(`/albums/${id}`),
    );
    if (hit) return hit;
  }
  const q = `album:"${title}" artist:"${primaryArtist(artist)}"`;
  return memoized(`albumsearch:${q.toLowerCase()}`, async () => {
    const res = await riff<{ albums: { items: RiffAlbum[] } }>(
      `/search?type=album&q=${encodeURIComponent(q)}`,
    );
    return res?.albums?.items?.[0] ?? null;
  });
}

async function findArtist(
  name: string,
  spotifyLink: string | null,
): Promise<RiffArtist | null> {
  const id = spotifyIdFromLink(spotifyLink, "artist");
  if (id) {
    const hit = await memoized(`artist:${id}`, () =>
      riff<RiffArtist>(`/artists/${id}`),
    );
    if (hit) return hit;
  }
  const q = `artist:"${name}"`;
  return memoized(`artistsearch:${q.toLowerCase()}`, async () => {
    const res = await riff<{ artists: { items: RiffArtist[] } }>(
      `/search?type=artist&q=${encodeURIComponent(q)}`,
    );
    return res?.artists?.items?.[0] ?? null;
  });
}

// ------------------------------------------------------------------- fillers

/** Should this album-art value be (re)written? */
function artNeedsFill(current: string | null): boolean {
  return current === null || current.startsWith(ROCKSKY_CDN_PREFIX);
}

async function fillTrack(row: {
  id: string;
  title: string;
  artist: string;
  albumArt: string | null;
  duration: number;
  trackNumber: number | null;
  discNumber: number | null;
  isrc: string | null;
  spotifyLink: string | null;
}): Promise<void> {
  const hit = await findTrack(row.title, row.artist, row.spotifyLink);
  if (!hit) {
    stats.missed += 1;
    return;
  }

  const art = bestImage(hit.album?.images);
  const patch: Record<string, unknown> = {};
  if (row.duration === 0 && hit.duration_ms > 0)
    patch.duration = hit.duration_ms;
  if (artNeedsFill(row.albumArt) && art) {
    patch.albumArt = art;
    if (row.albumArt?.startsWith(ROCKSKY_CDN_PREFIX)) stats.artReplaced += 1;
  }
  if (row.trackNumber === null && hit.track_number > 0)
    patch.trackNumber = hit.track_number;
  if (row.discNumber === null && hit.disc_number > 0)
    patch.discNumber = hit.disc_number;
  if (row.isrc === null && hit.external_ids?.isrc)
    patch.isrc = hit.external_ids.isrc;
  if (row.spotifyLink === null && hit.external_urls?.spotify)
    patch.spotifyLink = hit.external_urls.spotify;

  if (Object.keys(patch).length === 0) return;
  stats.updated += 1;
  if (DRY_RUN) {
    consola.info(
      `${chalk.cyan("track")} ${row.title} — ${row.artist}: ${Object.keys(patch).join(", ")}`,
    );
    return;
  }
  await ctx.db
    .update(tables.tracks)
    .set(patch)
    .where(eq(tables.tracks.id, row.id));
}

async function fillAlbum(row: {
  id: string;
  title: string;
  artist: string;
  albumArt: string | null;
  releaseDate: string | null;
  year: number | null;
  spotifyLink: string | null;
}): Promise<void> {
  const hit = await findAlbum(row.title, row.artist, row.spotifyLink);
  if (!hit) {
    stats.missed += 1;
    return;
  }

  const art = bestImage(hit.images);
  const patch: Record<string, unknown> = {};
  if (artNeedsFill(row.albumArt) && art) {
    patch.albumArt = art;
    if (row.albumArt?.startsWith(ROCKSKY_CDN_PREFIX)) stats.artReplaced += 1;
  }
  if (row.releaseDate === null && hit.release_date)
    patch.releaseDate = hit.release_date;
  if (row.year === null && hit.release_date) {
    const y = Number.parseInt(hit.release_date.slice(0, 4), 10);
    if (Number.isFinite(y)) patch.year = y;
  }
  if (row.spotifyLink === null && hit.external_urls?.spotify)
    patch.spotifyLink = hit.external_urls.spotify;

  if (Object.keys(patch).length === 0) return;
  stats.updated += 1;
  if (DRY_RUN) {
    consola.info(
      `${chalk.magenta("album")} ${row.title} — ${row.artist}: ${Object.keys(patch).join(", ")}`,
    );
    return;
  }
  await ctx.db
    .update(tables.albums)
    .set(patch)
    .where(eq(tables.albums.id, row.id));
}

async function fillArtist(row: {
  id: string;
  name: string;
  picture: string | null;
  genres: string[] | null;
  spotifyLink: string | null;
}): Promise<void> {
  const hit = await findArtist(row.name, row.spotifyLink);
  if (!hit) {
    stats.missed += 1;
    return;
  }

  const picture = bestImage(hit.images);
  const patch: Record<string, unknown> = {};
  if (row.picture === null && picture) patch.picture = picture;
  if (
    (row.genres === null || row.genres.length === 0) &&
    hit.genres?.length > 0
  )
    patch.genres = hit.genres;
  if (row.spotifyLink === null && hit.external_urls?.spotify)
    patch.spotifyLink = hit.external_urls.spotify;

  if (Object.keys(patch).length === 0) return;
  stats.updated += 1;
  if (DRY_RUN) {
    consola.info(
      `${chalk.yellow("artist")} ${row.name}: ${Object.keys(patch).join(", ")}`,
    );
    return;
  }
  await ctx.db
    .update(tables.artists)
    .set(patch)
    .where(eq(tables.artists.id, row.id));
}

// ------------------------------------------------------------------- walkers

/** Keyset-paginate a selection and run `work` over it with a worker pool. */
async function walk<Row extends { id: string }>(
  label: string,
  fetchPage: (cursor: string) => Promise<Row[]>,
  work: (row: Row) => Promise<void>,
): Promise<void> {
  let cursor = "";
  let done = 0;

  while (done < LIMIT) {
    const page = await fetchPage(cursor);
    if (page.length === 0) break;
    cursor = page[page.length - 1].id;

    let next = 0;
    const workers = Array.from(
      { length: Math.min(CONCURRENCY, page.length) },
      async () => {
        while (next < page.length && done < LIMIT) {
          const row = page[next];
          next += 1;
          done += 1;
          stats.scanned += 1;
          try {
            await work(row);
          } catch (e) {
            stats.errors += 1;
            consola.error(`${label} ${row.id}: ${e}`);
          }
        }
      },
    );
    await Promise.all(workers);

    consola.info(
      `${label}: ${done} scanned, ${stats.updated} updated, ${stats.missed} missed`,
    );
  }
}

async function main() {
  consola.info(
    `backfilling from riff at ${RIFF_API_URL}${DRY_RUN ? chalk.yellow(" (dry run)") : ""}`,
  );

  // Fail fast if riff is not there: every row would "miss" and the run would
  // report success while doing nothing.
  const health = await fetch(`${RIFF_API_URL.replace(/\/v1$/, "")}/health`, {
    signal: AbortSignal.timeout(5_000),
  }).catch(() => null);
  if (!health?.ok) {
    consola.error(`riff is not reachable at ${RIFF_API_URL} — start it first`);
    process.exit(1);
  }

  // The three walks run concurrently: they touch disjoint tables, riff
  // absorbs the combined request rate, and an operator watching
  // `SELECT COUNT(*)` on albums or artists sees movement immediately instead
  // of after a 31K-row tracks walk.
  const walks: Promise<void>[] = [];

  if (ONLY === "all" || ONLY === "tracks") {
    walks.push(
      walk(
        "tracks",
        (cursor) =>
          ctx.db
            .select({
              id: tables.tracks.id,
              title: tables.tracks.title,
              artist: tables.tracks.artist,
              albumArt: tables.tracks.albumArt,
              duration: tables.tracks.duration,
              trackNumber: tables.tracks.trackNumber,
              discNumber: tables.tracks.discNumber,
              isrc: tables.tracks.isrc,
              spotifyLink: tables.tracks.spotifyLink,
            })
            .from(tables.tracks)
            .where(
              and(
                gt(tables.tracks.id, cursor),
                or(
                  eq(tables.tracks.duration, 0),
                  isNull(tables.tracks.albumArt),
                  like(tables.tracks.albumArt, `${ROCKSKY_CDN_PREFIX}%`),
                ),
              ),
            )
            .orderBy(tables.tracks.id)
            .limit(PAGE_SIZE),
        fillTrack,
      ),
    );
  }

  if (ONLY === "all" || ONLY === "albums") {
    walks.push(
      walk(
        "albums",
        (cursor) =>
          ctx.db
            .select({
              id: tables.albums.id,
              title: tables.albums.title,
              artist: tables.albums.artist,
              albumArt: tables.albums.albumArt,
              releaseDate: tables.albums.releaseDate,
              year: tables.albums.year,
              spotifyLink: tables.albums.spotifyLink,
            })
            .from(tables.albums)
            .where(
              and(
                gt(tables.albums.id, cursor),
                or(
                  isNull(tables.albums.albumArt),
                  like(tables.albums.albumArt, `${ROCKSKY_CDN_PREFIX}%`),
                ),
              ),
            )
            .orderBy(tables.albums.id)
            .limit(PAGE_SIZE),
        fillAlbum,
      ),
    );
  }

  if (ONLY === "all" || ONLY === "artists") {
    walks.push(
      walk(
        "artists",
        (cursor) =>
          ctx.db
            .select({
              id: tables.artists.id,
              name: tables.artists.name,
              picture: tables.artists.picture,
              genres: tables.artists.genres,
              spotifyLink: tables.artists.spotifyLink,
            })
            .from(tables.artists)
            .where(
              and(
                gt(tables.artists.id, cursor),
                isNull(tables.artists.picture),
              ),
            )
            .orderBy(tables.artists.id)
            .limit(PAGE_SIZE),
        fillArtist,
      ),
    );
  }

  await Promise.all(walks);

  consola.success(
    `done: ${stats.scanned} scanned, ${chalk.green(stats.updated)} updated ` +
      `(${stats.artReplaced} cdn.rocksky.app art URLs replaced), ` +
      `${stats.missed} missed, ${stats.errors} errors`,
  );
  process.exit(0);
}

main().catch((e) => {
  consola.error(e);
  process.exit(1);
});
