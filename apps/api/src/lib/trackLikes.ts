import type { Context } from "context";
import { eq, inArray } from "drizzle-orm";
import tables from "schema";

/**
 * Fold loved-track counts into a list of tracks: one query for the whole list,
 * then grouped per track. `liked` is false without a DID, so an unauthenticated
 * caller still gets the counts.
 */
export async function withLikes<T>(
  ctx: Context,
  tracks: T[],
  did?: string,
  /** Where the track id lives, when the row's own `id` is something else. */
  selectId: (row: T) => string | null | undefined = (row) =>
    (row as { id?: string }).id,
): Promise<(T & { likesCount: number; liked: boolean })[]> {
  const idOf = selectId;
  const trackIds = tracks.map(idOf).filter(Boolean);
  if (trackIds.length === 0) return [];

  const likes = await ctx.db
    .select()
    .from(tables.lovedTracks)
    .leftJoin(tables.users, eq(tables.lovedTracks.userId, tables.users.id))
    .where(inArray(tables.lovedTracks.trackId, trackIds))
    .execute();

  return tracks.map((track) => {
    const trackLikes = likes.filter(
      (l) => l.loved_tracks.trackId === idOf(track),
    );
    return {
      ...track,
      likesCount: trackLikes.length,
      liked: !!did && trackLikes.some((l) => l.users?.did === did),
    };
  });
}
