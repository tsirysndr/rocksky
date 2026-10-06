import chalk from "chalk";
import { consola } from "consola";
import type { Context } from "context";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import tables from "schema";
import type {
  InsertDiscogsRelease,
  SelectDiscogsRelease,
} from "schema/discogs-releases";
import type { SelectDiscogsSearch } from "schema/discogs-searches";
import {
  type DiscogsEnrichResponse,
  type DiscogsEnrichedTrack,
  enrichWithDiscogs,
} from "./discogs";

// Discogs keeps being added to, so a miss is retried eventually rather than
// treated as settled; a hit is never re-asked.
export const MISS_RETRY_MS = 30 * 24 * 60 * 60 * 1000;

// "missed" is Discogs answering that it has nothing, and is recorded.
// "unavailable" is the service not answering at all, which records nothing so
// the next pass asks again — the backfill needs to tell those apart.
export type DiscogsLookup =
  | { status: "matched"; release: SelectDiscogsRelease }
  | { status: "missed" }
  | { status: "unavailable" }
  | { status: "skipped" };

export const discogsSearchKey = (artist: string, album: string) =>
  createHash("sha256")
    .update(`${album.trim()} - ${artist.trim()}`.toLowerCase())
    .digest("hex");

export const isStaleSearch = (
  search: Pick<SelectDiscogsSearch, "releaseId" | "searchedAt">,
  now = Date.now(),
) =>
  !search.releaseId &&
  now - new Date(search.searchedAt).getTime() > MISS_RETRY_MS;

// The album rows a scrobble writes are keyed this way, so the lookup can find
// the album to link without carrying its id around.
const albumKey = (album: string, albumArtist: string) =>
  createHash("sha256")
    .update(`${album} - ${albumArtist}`.toLowerCase())
    .digest("hex");

export const toDiscogsReleaseRow = (
  track: DiscogsEnrichedTrack,
  score?: number,
): InsertDiscogsRelease | undefined => {
  if (!track.discogsReleaseId || !track.album || !track.artist) {
    return undefined;
  }
  return {
    discogsId: track.discogsReleaseId,
    masterId: track.discogsMasterId ?? null,
    title: track.album,
    artist: track.albumArtist || track.artist,
    albumArt: track.albumArt ?? null,
    year: track.year ?? null,
    originalYear: track.originalYear ?? null,
    releaseDate: track.releaseDate ?? null,
    country: track.country ?? null,
    label: track.label ?? null,
    catalogNumber: track.catalogNumber ?? null,
    barcode: track.barcode ?? null,
    formats: track.formats ?? null,
    genres: track.genres ?? null,
    styles: track.styles ?? null,
    discogsUrl: track.discogsUrl ?? null,
    score: score ?? null,
  };
};

// The response carries no score of its own; it belongs to the candidate that
// was deep-fetched.
export const matchScore = (response: DiscogsEnrichResponse) =>
  response.matches.find((m) => m.id === response.track?.discogsReleaseId)
    ?.score ?? response.matches[0]?.score;

/**
 * Look an artist+album up on Discogs and store the match, answering from our
 * own tables whenever they already know. Never throws and never blocks
 * anything a scrobble depends on: every failure is logged and dropped.
 */
export const enrichAlbumWithDiscogs = async (
  ctx: Context,
  artist: string,
  album: string,
  albumId?: string,
): Promise<DiscogsLookup> => {
  if (!artist?.trim() || !album?.trim()) {
    return { status: "skipped" };
  }

  const sha256 = discogsSearchKey(artist, album);
  const existing = await ctx.db
    .select()
    .from(tables.discogsSearches)
    .where(eq(tables.discogsSearches.sha256, sha256))
    .limit(1)
    .then((rows) => rows[0]);

  if (existing && !isStaleSearch(existing)) {
    if (!existing.releaseId) {
      return { status: "missed" };
    }
    const release = await ctx.db
      .select()
      .from(tables.discogsReleases)
      .where(eq(tables.discogsReleases.id, existing.releaseId))
      .limit(1)
      .then((rows) => rows[0]);
    if (release) {
      await linkAlbum(ctx, { album, artist, albumId }, release.id);
      return { status: "matched", release };
    }
  }

  const response = await enrichWithDiscogs(ctx, { artist, album });
  if (!response) {
    // The service could not answer, so the question stays open rather than
    // being recorded as a miss for the next month.
    return { status: "unavailable" };
  }

  const row = response.track
    ? toDiscogsReleaseRow(response.track, matchScore(response))
    : undefined;
  if (!row) {
    await recordSearch(ctx, { sha256, artist, album, releaseId: null });
    consola.info(`No Discogs match for ${chalk.cyan(`${artist} - ${album}`)}`);
    return { status: "missed" };
  }

  const release = await ctx.db
    .insert(tables.discogsReleases)
    .values(row)
    .onConflictDoUpdate({
      target: tables.discogsReleases.discogsId,
      set: { ...row, updatedAt: new Date() },
    })
    .returning()
    .then((rows) => rows[0]);

  await recordSearch(ctx, {
    sha256,
    artist,
    album,
    releaseId: release.id,
    score: row.score ?? null,
  });
  await linkAlbum(ctx, { album, artist, albumId }, release.id);

  consola.info(
    `Discogs matched ${chalk.cyan(`${artist} - ${album}`)} to release ${chalk.green(release.discogsId)}`,
  );
  return { status: "matched", release };
};

const recordSearch = async (
  ctx: Context,
  values: {
    sha256: string;
    artist: string;
    album: string;
    releaseId: string | null;
    score?: number | null;
  },
) => {
  const searchedAt = new Date();
  await ctx.db
    .insert(tables.discogsSearches)
    .values({ ...values, searchedAt })
    .onConflictDoUpdate({
      target: tables.discogsSearches.sha256,
      set: {
        releaseId: values.releaseId,
        score: values.score ?? null,
        searchedAt,
        updatedAt: searchedAt,
      },
    });
};

// The link is only ever filled in, never overwritten. A caller that already
// has the album row says so; the scrobble path only knows the track, so it
// finds the album under the hash a scrobble writes it with.
const linkAlbum = async (
  ctx: Context,
  target: { album: string; artist: string; albumId?: string },
  releaseId: string,
) => {
  const existing = await ctx.db
    .select()
    .from(tables.albums)
    .where(
      target.albumId
        ? eq(tables.albums.id, target.albumId)
        : eq(tables.albums.sha256, albumKey(target.album, target.artist)),
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (!existing || existing.discogsReleaseId) {
    return;
  }
  await ctx.db
    .update(tables.albums)
    .set({ discogsReleaseId: releaseId })
    .where(eq(tables.albums.id, existing.id));
};

/**
 * Fire-and-forget Discogs enrichment for a scrobbled track. Called from the
 * new-scrobble subscriber, which has already answered the scrobbler.
 */
export const enrichScrobbleWithDiscogs = async (
  ctx: Context,
  trackId: string,
) => {
  const track = await ctx.db
    .select()
    .from(tables.tracks)
    .where(eq(tables.tracks.id, trackId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!track) {
    return;
  }
  await enrichAlbumWithDiscogs(
    ctx,
    track.albumArtist || track.artist,
    track.album,
  );
};
