import { randomUUID } from "node:crypto";
import type { Context } from "context";
import { eq } from "drizzle-orm";
import { env } from "lib/env";
import users from "../schema/users";

// Bot-scrobble guard.
//
// Some clients started submitting scrobbles every ~1-2 minutes, sustained.
// A real listener cannot scrobble *distinct* tracks faster than the tracks
// physically play (and the ±60s dedup in scrobbleTrack already collapses the
// repeated now-playing pings for a single song). So a per-user rolling window
// of *accepted* scrobbles is a clean bot fingerprint: exceeding the threshold
// means sustaining a cadence no genuine listening session reaches.
//
// Tunable via env so thresholds can be adjusted without a code change:
//   SCROBBLE_ABUSE_WINDOW  rolling window, seconds        (default 1800 = 30m)
//   SCROBBLE_ABUSE_MAX     max accepted scrobbles/window  (default 25)
//   SCROBBLE_ABUSE_BLOCK   temp block duration, seconds   (default 3600 = 1h)
// The default 25 / 30min trips only at a sustained avg < 72s per track for a
// full half hour — physically impossible for a human (even all-2-minute-song
// listening is ~15/30min). Set SCROBBLE_ABUSE_MAX=0 to disable the guard.
const WINDOW_SECONDS = env.SCROBBLE_ABUSE_WINDOW;
const MAX_IN_WINDOW = env.SCROBBLE_ABUSE_MAX;
const BLOCK_SECONDS = env.SCROBBLE_ABUSE_BLOCK;

const blockKey = (did: string) => `scrobble:block:${did}`;
const rateKey = (did: string) => `scrobble:rate:${did}`;

export class ScrobbleBlockedError extends Error {
  readonly did: string;
  readonly retryAfter: number;
  constructor(did: string, retryAfter: number) {
    super(
      `Scrobble temporarily blocked for ${did} (retry after ${retryAfter}s)`,
    );
    this.name = "ScrobbleBlockedError";
    this.did = did;
    this.retryAfter = retryAfter;
  }
}

/**
 * Human-readable explanation returned to a suspected bot on both scrobble
 * entry points (429 on /now-playing, XRPC error on createScrobble).
 */
export function scrobbleBlockedMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return (
    "Your account has been temporarily blocked from scrobbling because we detected " +
    "an abnormally high scrobble rate — scrobbles are arriving faster than tracks can " +
    "physically be played, which is a pattern typical of bots or misconfigured clients. " +
    "Normal listening never triggers this. To resume, submit one scrobble per track only " +
    "after it has actually played (roughly half its length or ~4 minutes, as Last.fm does), " +
    "rather than on a fixed short timer. If you believe this is a mistake, contact " +
    `support@rocksky.app. You can retry in about ${minutes} minute(s).`
  );
}

/**
 * Raised when a user carries a persistent `is_bot` flag in the DB. Unlike the
 * rolling-window block (which expires), this flag is set by the offline
 * scrobble-abuse-sweep service and cleared only by an operator. Extends
 * ScrobbleBlockedError so existing `instanceof ScrobbleBlockedError` handlers at
 * both scrobble entry points already reject it with a 429.
 */
export class ScrobbleBotFlaggedError extends ScrobbleBlockedError {
  constructor(did: string) {
    // retryAfter is meaningless for a persistent flag; keep it 0.
    super(did, 0);
    this.name = "ScrobbleBotFlaggedError";
  }
}

/**
 * Human-readable explanation returned to a user whose account is flagged as a
 * bot. Distinct from the rate-limit message because the flag is not time-boxed.
 */
export function scrobbleBotFlaggedMessage(): string {
  return (
    "Your account has been flagged as a bot and can no longer scrobble. This " +
    "happens when scrobbles arrive continuously, around the clock, faster than " +
    "tracks can physically be played — a pattern real listening never produces. " +
    "If you believe this is a mistake, contact support@rocksky.app to have it reviewed."
  );
}

/**
 * Reject if the user carries the persistent `is_bot` flag. This is the "always
 * check the flag" enforcement: one indexed lookup on the scrobble path, in
 * addition to the rolling-window guard below.
 */
export async function assertNotBotFlagged(
  ctx: Context,
  did: string,
): Promise<void> {
  const row = await ctx.db
    .select({ isBot: users.isBot })
    .from(users)
    .where(eq(users.did, did))
    .limit(1)
    .then((rows) => rows[0]);

  if (row?.isBot) throw new ScrobbleBotFlaggedError(did);
}

/**
 * Reject early if the user is currently under a temporary block. Cheap enough
 * to call before any DB work so blocked bots don't hit Postgres at all.
 */
export async function assertNotScrobbleBlocked(
  ctx: Context,
  did: string,
): Promise<void> {
  if (MAX_IN_WINDOW <= 0) return; // guard disabled
  const ttl = await ctx.redis.ttl(blockKey(did));
  if (ttl > 0) throw new ScrobbleBlockedError(did, ttl);
}

/**
 * Record an accepted scrobble in the user's rolling window keyed by scrobble
 * time. If the user has now exceeded MAX_IN_WINDOW accepted scrobbles inside
 * WINDOW_SECONDS, place a temporary block and throw ScrobbleBlockedError.
 *
 * Call this only for genuinely new scrobbles (i.e. after the dedup check has
 * passed) so repeated now-playing pings for the same song don't inflate the
 * count.
 */
export async function recordScrobbleAndGuard(
  ctx: Context,
  did: string,
  scrobbleTimeUnix: number,
): Promise<void> {
  if (MAX_IN_WINDOW <= 0) return; // guard disabled

  const key = rateKey(did);
  const nowMs = scrobbleTimeUnix * 1000;
  const windowStartMs = nowMs - WINDOW_SECONDS * 1000;

  // Atomically: add this scrobble, drop anything older than the window, count
  // what's left, and keep the key from lingering past the window when idle.
  const results = await ctx.redis
    .multi()
    .zAdd(key, { score: nowMs, value: `${nowMs}:${randomUUID()}` })
    .zRemRangeByScore(key, 0, windowStartMs)
    .zCard(key)
    .expire(key, WINDOW_SECONDS)
    .exec();

  // zCard is the third command in the pipeline.
  const count = Number(results?.[2] ?? 0);

  if (count > MAX_IN_WINDOW) {
    await ctx.redis.set(blockKey(did), "1", { EX: BLOCK_SECONDS });
    throw new ScrobbleBlockedError(did, BLOCK_SECONDS);
  }
}
