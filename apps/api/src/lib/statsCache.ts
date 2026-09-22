import { consola } from "consola";
import type { Context } from "context";

export type CachedStats = {
  scrobbles: number;
  artists: number;
  loved_tracks: number;
  albums: number;
  tracks: number;
};

// A profile card's counts are aggregates over the whole `scrobbles` table, so
// the charts pages — which render a hundred of them at once — were re-running
// them on every visit and draining the pg pool. Five minutes is long enough to
// collapse that into one round, short enough that a count is never visibly
// wrong; a scrobble invalidates the owner's entry anyway.
const TTL_SECONDS = 300;

const key = (actor: string) => `stats:v1:${actor}`;

/** Looks up cached stats by DID or handle, whichever the caller was given. */
export async function readStats(
  ctx: Context,
  actor: string,
): Promise<CachedStats | null> {
  try {
    const raw = await ctx.redis.get(key(actor));
    return raw ? (JSON.parse(raw) as CachedStats) : null;
  } catch (err) {
    consola.warn("readStats failed:", err);
    return null;
  }
}

export async function writeStats(
  ctx: Context,
  actor: string,
  stats: CachedStats,
): Promise<void> {
  // Never cache an empty profile. Both web clients read zero scrobbles on your
  // own profile as "new user" and show the onboarding flow, so a zero that
  // outlives your first scrobble is worse than re-running the aggregates.
  if (stats.scrobbles === 0) return;
  try {
    await ctx.redis.setEx(key(actor), TTL_SECONDS, JSON.stringify(stats));
  } catch (err) {
    consola.warn("writeStats failed:", err);
  }
}

/**
 * Drops every cached entry for one user. Both identifiers have to be passed:
 * getStats is reached by DID from the apps and by handle from profile links,
 * and each spelling caches under its own key.
 */
export async function invalidateStats(
  ctx: Context,
  ...actors: (string | null | undefined)[]
): Promise<void> {
  const keys = actors.filter((a): a is string => !!a).map(key);
  if (keys.length === 0) return;
  try {
    await ctx.redis.del(keys);
  } catch (err) {
    consola.warn("invalidateStats failed:", err);
  }
}
