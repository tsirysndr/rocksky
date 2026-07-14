import { consola } from "consola";
import { sql } from "drizzle-orm";
import drizzle from "./drizzle.ts";
import { env } from "./utils/env.ts";

const { db } = drizzle;

/**
 * A user whose recent scrobble stream matches the sustained round-the-clock
 * looping pattern of a bot — high volume, tight cadence, active in nearly every
 * hour of the day, and never a sleep-length quiet break.
 */
export type BotCandidate = {
  did: string;
  handle: string;
  n: number;
  distinct_tracks: number;
  p90_gap: number;
  longest_quiet_min: number;
  hrs_of_day: number;
  span_h: number;
};

/**
 * Score every user active in the lookback window on five independent signals and
 * return those matching all of them. Users already flagged (is_bot=true) are
 * excluded so each run only surfaces *new* offenders.
 *
 * The defining signal is longest_quiet_min: a real listener — even a heavy one
 * running music all day — always has at least one multi-hour silent stretch
 * (sleep). A stream that never goes quiet for >2h while sustaining 400+ scrobbles
 * across a full day, in nearly every hour, at a <5min p90 cadence, is not human.
 */
export async function detectBots(): Promise<BotCandidate[]> {
  const result = await db.execute(sql`
    WITH recent AS (
      SELECT
        user_id,
        track_id,
        "timestamp",
        extract(epoch FROM ("timestamp" - lag("timestamp")
          OVER (PARTITION BY user_id ORDER BY "timestamp"))) AS gap
      FROM scrobbles
      WHERE "timestamp" > now() - (${env.SWEEP_LOOKBACK_HOURS} * interval '1 hour')
    ),
    agg AS (
      SELECT
        user_id,
        count(*) AS n,
        count(DISTINCT track_id) AS distinct_tracks,
        percentile_cont(0.90) WITHIN GROUP (ORDER BY gap) AS p90_gap,
        max(gap) / 60.0 AS longest_quiet_min,
        count(DISTINCT extract(hour FROM "timestamp")) AS hrs_of_day,
        extract(epoch FROM (max("timestamp") - min("timestamp"))) / 3600.0 AS span_h
      FROM recent
      GROUP BY user_id
    )
    SELECT
      u.did,
      u.handle,
      a.n::int AS n,
      a.distinct_tracks::int AS distinct_tracks,
      round(a.p90_gap)::int AS p90_gap,
      round(a.longest_quiet_min)::int AS longest_quiet_min,
      a.hrs_of_day::int AS hrs_of_day,
      round(a.span_h::numeric, 1)::float8 AS span_h
    FROM agg a
    JOIN users u ON u.xata_id = a.user_id
    WHERE a.span_h >= ${env.SWEEP_MIN_SPAN_HOURS}
      AND a.n >= ${env.SWEEP_MIN_SCROBBLES}
      AND a.hrs_of_day >= ${env.SWEEP_MIN_HOURS_OF_DAY}
      AND a.longest_quiet_min < ${env.SWEEP_MAX_QUIET_MIN}
      AND a.p90_gap < ${env.SWEEP_MAX_P90_GAP_SEC}
      AND u.is_bot = false
    ORDER BY a.longest_quiet_min ASC
  `);

  return result.rows as unknown as BotCandidate[];
}

function reasonFor(c: BotCandidate): string {
  return (
    `auto-flagged by scrobble-abuse-sweep: ${c.n} scrobbles / ` +
    `${env.SWEEP_LOOKBACK_HOURS}h across ${c.distinct_tracks} tracks, ` +
    `p90 gap ${c.p90_gap}s, longest quiet ${c.longest_quiet_min}min, ` +
    `active ${c.hrs_of_day}/24h of day`
  );
}

/**
 * Persist the flag. Idempotent and race-safe: the `is_bot = false` guard means a
 * user already flagged (by a concurrent run or an earlier pass) is left as-is, so
 * bot_flagged_at keeps its original value.
 */
export async function flagBots(candidates: BotCandidate[]): Promise<number> {
  let flagged = 0;
  for (const c of candidates) {
    const res = await db.execute(sql`
      UPDATE users
      SET is_bot = true, bot_flagged_at = now(), bot_reason = ${reasonFor(c)}
      WHERE did = ${c.did} AND is_bot = false
    `);
    flagged += res.rowCount ?? 0;
  }
  return flagged;
}

/** One full detection pass: detect, log the evidence, then flag (unless dry-run). */
export async function runSweep(): Promise<void> {
  const candidates = await detectBots();

  if (candidates.length === 0) {
    consola.info("[sweep] no new bot-like accounts detected");
    return;
  }

  consola.warn(`[sweep] ${candidates.length} candidate(s):`);
  for (const c of candidates) {
    consola.warn(
      `  ${c.handle} (${c.did}) — n=${c.n} tracks=${c.distinct_tracks} ` +
        `p90=${c.p90_gap}s quiet=${c.longest_quiet_min}min hrs=${c.hrs_of_day}/24`,
    );
  }

  if (env.SWEEP_DRY_RUN) {
    consola.info(
      `[sweep] DRY_RUN — would flag ${candidates.length} account(s); no writes made`,
    );
    return;
  }

  const flagged = await flagBots(candidates);
  consola.success(`[sweep] flagged ${flagged} account(s) as bot`);
}
