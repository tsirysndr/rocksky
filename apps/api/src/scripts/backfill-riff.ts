/**
 * Complete missing catalog metadata from riff — the local Spotify catalog API
 * served out of the Parquet dump (see riff/README.md).
 *
 * Walks, in parallel (the tables are disjoint and riff absorbs the combined
 * rate):
 *   - tracks  where duration = 0, album_art IS NULL, or album_art points at
 *             cdn.rocksky.app or cdn.bsky.app
 *   - albums  where album_art IS NULL or album_art points at cdn.rocksky.app
 *             or cdn.bsky.app
 *   - artists where picture IS NULL
 *
 * Each row resolves to a Spotify object — by the stored spotify_link id when
 * there is one, then by exact title+artist search, then down a ladder of
 * normalized title variants (suffixes like `- From "..."`, `(feat. ...)` and
 * `- Remastered 2011` stripped) because the dump and our rows disagree exactly
 * there. Every field riff can answer is filled without overwriting existing
 * values; the one deliberate overwrite is album art still pointing at
 * cdn.rocksky.app or cdn.bsky.app, replaced with Spotify's CDN URL.
 *
 *   tracks:  duration, album_art, isrc, track_number, disc_number, spotify_link
 *   albums:  album_art, release_date, year, spotify_link
 *   artists: picture, genres, spotify_link
 *
 * Misses are skipped, not retried — riff mirrors a dump; whatever it lacks can
 * wait for a rerun after the next dump refresh.
 *
 * Usage (also wired as `bun riff:backfill`):
 *   tsx ./src/scripts/backfill-riff.ts
 *
 * Env:
 *   RIFF_API_URL           riff base URL (default http://localhost:8092/v1)
 *   BACKFILL_PAGE_SIZE     rows fetched per DB page (default 500)
 *   BACKFILL_CONCURRENCY   parallel workers per walk (default 4)
 *   BACKFILL_LIMIT         stop after this many rows per entity (default: all)
 *   BACKFILL_ONLY          "tracks" | "albums" | "artists" | "all" (default all)
 *   BACKFILL_DRY_RUN       "1" — resolve and report, write nothing
 *   BACKFILL_QUIET         "1" — page summaries only, no per-row update lines
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
const QUIET = process.env.BACKFILL_QUIET === "1";

/**
 * Art hosted on CDNs we want to move off of, replaced by Spotify's CDN URL
 * whenever riff has one: our own uploads and Bluesky-hosted blobs.
 */
const REPLACEABLE_ART_PREFIXES = [
  "https://cdn.rocksky.app",
  "https://cdn.bsky.app",
];

function isReplaceableArt(url: string | null): boolean {
  return (
    url !== null && REPLACEABLE_ART_PREFIXES.some((p) => url.startsWith(p))
  );
}

type Outcome = "updated" | "missed" | "clean";

type WalkStats = {
  scanned: number;
  updated: number;
  missed: number;
  clean: number;
  artReplaced: number;
  errors: number;
};

const newStats = (): WalkStats => ({
  scanned: 0,
  updated: 0,
  missed: 0,
  clean: 0,
  artReplaced: 0,
  errors: 0,
});

/** Per-entity counters, so a page summary never mixes the three walks. */
const stats: Record<"tracks" | "albums" | "artists", WalkStats> = {
  tracks: newStats(),
  albums: newStats(),
  artists: newStats(),
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

async function riff<T>(path: string, s: WalkStats): Promise<T | null> {
  try {
    const res = await fetch(`${RIFF_API_URL}${path}`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null; // 404 = riff does not have it; a rerun may.
    return (await res.json()) as T;
  } catch (e) {
    s.errors += 1;
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
  return url && !isReplaceableArt(url) ? url : null;
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

/**
 * Title variants to try in order, most-specific first. The dump and our rows
 * disagree exactly here: `Arrival of the Birds (From "The Crimson Wing...")`
 * is stored bare as `Arrival of the Birds` in the dump; remaster and feat
 * suffixes come and go between sources. Each variant is one cheap riff call,
 * and the ladder stops at the first hit.
 */
function titleVariants(title: string): string[] {
  const variants = [title];
  const push = (t: string) => {
    const v = t.trim().replace(/\s{2,}/g, " ");
    if (v.length > 1 && !variants.includes(v)) variants.push(v);
  };

  // `- From "Movie"` / `(From "Movie")` soundtrack suffixes.
  push(title.replace(/\s*[-–—]\s*from\s+["“].*$/i, ""));
  push(title.replace(/\s*\(\s*from\s+[^)]*\)\s*$/i, ""));
  // Featured-artist suffixes; the credit lives in track_artists anyway.
  push(title.replace(/\s*[([]\s*(feat|ft|with)\.?\s+[^)\]]*[)\]]\s*$/i, ""));
  // `- Remastered 2011`, `- Single Version`, `- Radio Edit`, `- Live`, ...
  push(
    title.replace(
      /\s*[-–—]\s*(remaster(ed)?(\s+\d{4})?|single version|radio edit|album version|mono|stereo|live|bonus track|extended(\s+mix)?|original mix)\s*$/i,
      "",
    ),
  );
  // Any residual trailing parenthetical, as the last resort.
  push(title.replace(/\s*\([^)]*\)\s*$/, ""));

  return variants;
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

async function searchOne<T>(
  kind: "track" | "album" | "artist",
  q: string,
  s: WalkStats,
): Promise<T | null> {
  return memoized(`${kind}search:${q.toLowerCase()}`, async () => {
    const res = await riff<Record<string, { items: T[] }>>(
      `/search?type=${kind}&q=${encodeURIComponent(q)}`,
      s,
    );
    return res?.[`${kind}s`]?.items?.[0] ?? null;
  });
}

async function findTrack(
  title: string,
  artist: string,
  spotifyLink: string | null,
  s: WalkStats,
): Promise<RiffTrack | null> {
  const id = spotifyIdFromLink(spotifyLink, "track");
  if (id) {
    const hit = await memoized(`track:${id}`, () =>
      riff<RiffTrack>(`/tracks/${id}`, s),
    );
    if (hit) return hit;
  }
  for (const t of titleVariants(title)) {
    const hit = await searchOne<RiffTrack>(
      "track",
      `track:"${t}" artist:"${primaryArtist(artist)}"`,
      s,
    );
    if (hit) return hit;
  }
  return null;
}

async function findAlbum(
  title: string,
  artist: string,
  spotifyLink: string | null,
  s: WalkStats,
): Promise<RiffAlbum | null> {
  const id = spotifyIdFromLink(spotifyLink, "album");
  if (id) {
    const hit = await memoized(`album:${id}`, () =>
      riff<RiffAlbum>(`/albums/${id}`, s),
    );
    if (hit) return hit;
  }
  for (const t of titleVariants(title)) {
    const hit = await searchOne<RiffAlbum>(
      "album",
      `album:"${t}" artist:"${primaryArtist(artist)}"`,
      s,
    );
    if (hit) return hit;
  }
  return null;
}

async function findArtist(
  name: string,
  spotifyLink: string | null,
  s: WalkStats,
): Promise<RiffArtist | null> {
  const id = spotifyIdFromLink(spotifyLink, "artist");
  if (id) {
    const hit = await memoized(`artist:${id}`, () =>
      riff<RiffArtist>(`/artists/${id}`, s),
    );
    if (hit) return hit;
  }
  return searchOne<RiffArtist>("artist", `artist:"${name}"`, s);
}

// ------------------------------------------------------------------- fillers

/** Should this album-art value be (re)written? */
function artNeedsFill(current: string | null): boolean {
  return current === null || isReplaceableArt(current);
}

/**
 * Runs an update; when it trips a unique constraint on spotify_link, retries
 * without the link. The catalog holds duplicate rows for the same real album
 * or track, all resolving to one Spotify object — only the first duplicate can
 * hold the (unique) link, but every duplicate should still get its art,
 * duration and dates.
 */
async function applyPatch(
  patch: Record<string, unknown>,
  update: (p: Record<string, unknown>) => Promise<unknown>,
): Promise<void> {
  try {
    await update(patch);
  } catch (e) {
    const message = String((e as Error).cause ?? e);
    const uniqueLink =
      "spotifyLink" in patch &&
      (message.includes("spotify_link") || message.includes("23505"));
    if (!uniqueLink) throw e;
    const { spotifyLink: _dropped, ...rest } = patch;
    if (Object.keys(rest).length > 0) await update(rest);
  }
}

/** One line per row written, so the journal shows exactly what changed. */
function logUpdate(kind: string, color: (s: string) => string, what: string) {
  if (QUIET) return;
  const marker = DRY_RUN ? chalk.yellow("[dry] ") : "";
  consola.info(`${marker}${color(kind)} ${what}`);
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
}): Promise<Outcome> {
  const s = stats.tracks;
  const hit = await findTrack(row.title, row.artist, row.spotifyLink, s);
  if (!hit) return "missed";

  const art = bestImage(hit.album?.images);
  const patch: Record<string, unknown> = {};
  if (row.duration === 0 && hit.duration_ms > 0)
    patch.duration = hit.duration_ms;
  if (artNeedsFill(row.albumArt) && art) {
    patch.albumArt = art;
    if (isReplaceableArt(row.albumArt)) s.artReplaced += 1;
  }
  if (row.trackNumber === null && hit.track_number > 0)
    patch.trackNumber = hit.track_number;
  if (row.discNumber === null && hit.disc_number > 0)
    patch.discNumber = hit.disc_number;
  if (row.isrc === null && hit.external_ids?.isrc)
    patch.isrc = hit.external_ids.isrc;
  if (row.spotifyLink === null && hit.external_urls?.spotify)
    patch.spotifyLink = hit.external_urls.spotify;

  if (Object.keys(patch).length === 0) return "clean";
  logUpdate(
    "track ",
    chalk.cyan,
    `${row.title} — ${row.artist}: ${Object.keys(patch).join(", ")}`,
  );
  if (!DRY_RUN) {
    await applyPatch(patch, (p) =>
      ctx.db.update(tables.tracks).set(p).where(eq(tables.tracks.id, row.id)),
    );
  }
  return "updated";
}

async function fillAlbum(row: {
  id: string;
  title: string;
  artist: string;
  albumArt: string | null;
  releaseDate: string | null;
  year: number | null;
  spotifyLink: string | null;
}): Promise<Outcome> {
  const s = stats.albums;
  const hit = await findAlbum(row.title, row.artist, row.spotifyLink, s);
  if (!hit) return "missed";

  const art = bestImage(hit.images);
  const patch: Record<string, unknown> = {};
  if (artNeedsFill(row.albumArt) && art) {
    patch.albumArt = art;
    if (isReplaceableArt(row.albumArt)) s.artReplaced += 1;
  }
  if (row.releaseDate === null && hit.release_date)
    patch.releaseDate = hit.release_date;
  if (row.year === null && hit.release_date) {
    const y = Number.parseInt(hit.release_date.slice(0, 4), 10);
    if (Number.isFinite(y)) patch.year = y;
  }
  if (row.spotifyLink === null && hit.external_urls?.spotify)
    patch.spotifyLink = hit.external_urls.spotify;

  if (Object.keys(patch).length === 0) return "clean";
  logUpdate(
    "album ",
    chalk.magenta,
    `${row.title} — ${row.artist}: ${Object.keys(patch).join(", ")}`,
  );
  if (!DRY_RUN) {
    await applyPatch(patch, (p) =>
      ctx.db.update(tables.albums).set(p).where(eq(tables.albums.id, row.id)),
    );
  }
  return "updated";
}

async function fillArtist(row: {
  id: string;
  name: string;
  picture: string | null;
  genres: string[] | null;
  spotifyLink: string | null;
}): Promise<Outcome> {
  const s = stats.artists;
  const hit = await findArtist(row.name, row.spotifyLink, s);
  if (!hit) return "missed";

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

  if (Object.keys(patch).length === 0) return "clean";
  logUpdate(
    "artist",
    chalk.yellow,
    `${row.name}: ${Object.keys(patch).join(", ")}`,
  );
  if (!DRY_RUN) {
    await applyPatch(patch, (p) =>
      ctx.db.update(tables.artists).set(p).where(eq(tables.artists.id, row.id)),
    );
  }
  return "updated";
}

// ------------------------------------------------------------------- walkers

/** Keyset-paginate a selection and run `work` over it with a worker pool. */
async function walk<Row extends { id: string }>(
  label: "tracks" | "albums" | "artists",
  fetchPage: (cursor: string) => Promise<Row[]>,
  work: (row: Row) => Promise<Outcome>,
): Promise<void> {
  const s = stats[label];
  let cursor = "";

  while (s.scanned < LIMIT) {
    const page = await fetchPage(cursor);
    if (page.length === 0) break;
    cursor = page[page.length - 1].id;

    let next = 0;
    const workers = Array.from(
      { length: Math.min(CONCURRENCY, page.length) },
      async () => {
        while (next < page.length && s.scanned < LIMIT) {
          const row = page[next];
          next += 1;
          s.scanned += 1;
          try {
            s[await work(row)] += 1;
          } catch (e) {
            s.errors += 1;
            consola.error(`${label} ${row.id}: ${e}`);
          }
        }
      },
    );
    await Promise.all(workers);

    consola.info(
      chalk.bold(
        `${label}: ${s.scanned} scanned, ${s.updated} updated, ${s.missed} missed, ${s.errors} errors`,
      ),
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
  // `SELECT COUNT(*)` on albums or artists sees movement immediately.
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
                  ...REPLACEABLE_ART_PREFIXES.map((p) =>
                    like(tables.tracks.albumArt, `${p}%`),
                  ),
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
                  ...REPLACEABLE_ART_PREFIXES.map((p) =>
                    like(tables.albums.albumArt, `${p}%`),
                  ),
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

  for (const [label, s] of Object.entries(stats)) {
    consola.success(
      `${label}: ${s.scanned} scanned, ${chalk.green(s.updated)} updated ` +
        `(${s.artReplaced} rocksky/bsky art URLs replaced), ` +
        `${s.missed} missed, ${s.clean} already complete, ${s.errors} errors`,
    );
  }
  process.exit(0);
}

main().catch((e) => {
  consola.error(e);
  process.exit(1);
});
