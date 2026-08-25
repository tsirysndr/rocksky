import type { Context } from "context";
import { eq, inArray } from "drizzle-orm";
import tables from "schema";

/**
 * Fold loved-track counts into a list of tracks: `liked` is false without a
 * DID, so an unauthenticated caller still gets the counts.
 *
 * Matching is by sha256, not by row id. lovedtracks.service resolves the track
 * to like by sha256(lower("title - artist - album")), and the same song can
 * exist as several `tracks` rows (a single and a compilation share an ISRC, a
 * re-ingest makes a second row, …). Comparing row ids reports a track as
 * unliked whenever the row the caller is looking at isn't the one the like
 * happened to land on.
 */
export async function withLikes<T>(
  ctx: Context,
  rows: T[],
  did?: string,
  /** Where the track id lives, when the row's own `id` is something else. */
  selectId: (row: T) => string | null | undefined = (row) =>
    (row as { id?: string } | undefined)?.id,
): Promise<(T & { likesCount: number; liked: boolean })[]> {
  const trackIds = rows.map(selectId).filter(Boolean) as string[];
  if (trackIds.length === 0) return [];

  const identities = await ctx.db
    .select({ id: tables.tracks.id, sha256: tables.tracks.sha256 })
    .from(tables.tracks)
    .where(inArray(tables.tracks.id, trackIds))
    .execute();

  const shaById = new Map(identities.map((t) => [t.id, t.sha256]));
  const shas = [...new Set(identities.map((t) => t.sha256).filter(Boolean))];
  if (shas.length === 0) {
    return rows.map((row) => ({ ...row, likesCount: 0, liked: false }));
  }

  const likes = await ctx.db
    .select({ sha256: tables.tracks.sha256, did: tables.users.did })
    .from(tables.lovedTracks)
    .innerJoin(tables.tracks, eq(tables.lovedTracks.trackId, tables.tracks.id))
    .leftJoin(tables.users, eq(tables.lovedTracks.userId, tables.users.id))
    .where(inArray(tables.tracks.sha256, shas))
    .execute();

  return rows.map((row) => {
    const sha = shaById.get(selectId(row) ?? "");
    const forTrack = sha ? likes.filter((l) => l.sha256 === sha) : [];
    return {
      ...row,
      likesCount: forTrack.length,
      liked: !!did && forTrack.some((l) => l.did === did),
    };
  });
}
