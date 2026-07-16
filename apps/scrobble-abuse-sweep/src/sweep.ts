import { consola } from "consola";
import { sql } from "drizzle-orm";
import drizzle from "./drizzle.ts";
import { env } from "./utils/env.ts";

const { db } = drizzle;

/**
 * A user whose recent scrobble stream matches a known bot pattern. Two
 * detectors produce candidates:
 *
 *  - "round-the-clock": high volume, tight cadence, active in nearly every hour
 *    of the day, spanning a full day, and never a sleep-length quiet break.
 *  - "burst": a dense, no-break burst that logs tracks *faster than they can
 *    physically play* — caught without needing a full day of history.
 *
 * `reason` is the human-readable string persisted to `users.bot_reason`;
 * `evidence` is a compact one-liner for the sweep log.
 */
export type BotCandidate = {
  detector: "round-the-clock" | "burst";
  did: string;
  handle: string;
  reason: string;
  evidence: string;
};

/**
 * Round-the-clock detector. Score every user active in the lookback window on
 * five independent signals and return those matching all of them.
 *
 * The defining signal is longest_quiet_min: a real listener — even a heavy one
 * running music all day — always has at least one multi-hour silent stretch
 * (sleep). A stream that never goes quiet for >2h while sustaining 400+ scrobbles
 * across a full day, in nearly every hour, at a <5min p90 cadence, is not human.
 */
export async function detectRoundTheClockBots(): Promise<BotCandidate[]> {
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

  return (result.rows as Array<Record<string, unknown>>).map((r) => {
    const c = r as {
      did: string;
      handle: string;
      n: number;
      distinct_tracks: number;
      p90_gap: number;
      longest_quiet_min: number;
      hrs_of_day: number;
    };
    return {
      detector: "round-the-clock" as const,
      did: c.did,
      handle: c.handle,
      reason:
        `auto-flagged by scrobble-abuse-sweep (round-the-clock): ${c.n} scrobbles / ` +
        `${env.SWEEP_LOOKBACK_HOURS}h across ${c.distinct_tracks} tracks, ` +
        `p90 gap ${c.p90_gap}s, longest quiet ${c.longest_quiet_min}min, ` +
        `active ${c.hrs_of_day}/24h of day`,
      evidence:
        `n=${c.n} tracks=${c.distinct_tracks} p90=${c.p90_gap}s ` +
        `quiet=${c.longest_quiet_min}min hrs=${c.hrs_of_day}/24`,
    };
  });
}

/**
 * Burst detector. Catches a dense, no-break burst that logs tracks faster than
 * they can physically play — the signature of a fresh account looping a small
 * catalogue that hasn't yet accrued the full-day history the round-the-clock
 * detector requires.
 *
 * The defining signal is the *impossibly-fast share*: a genuine scrobble only
 * registers after most of a track has actually played, so the gap since the
 * previous scrobble should be at least ~one track length. Counting the fraction
 * of scrobbles that instead land within `SWEEP_BURST_FAST_FRACTION` of the
 * track's own duration gives a rate that no real listener sustains — calibration
 * put the heaviest genuine listener at 18% against the 30% cutoff.
 */
export async function detectBurstBots(): Promise<BotCandidate[]> {
  const result = await db.execute(sql`
    WITH recent AS (
      SELECT
        sc.user_id,
        sc.track_id,
        sc."timestamp",
        t.duration AS dur_ms,
        extract(epoch FROM (sc."timestamp" - lag(sc."timestamp")
          OVER (PARTITION BY sc.user_id ORDER BY sc."timestamp"))) AS gap
      FROM scrobbles sc
      LEFT JOIN tracks t ON t.xata_id = sc.track_id
      WHERE sc."timestamp" > now() - (${env.SWEEP_LOOKBACK_HOURS} * interval '1 hour')
    ),
    agg AS (
      SELECT
        user_id,
        count(*) AS n,
        count(DISTINCT track_id) AS distinct_tracks,
        max(gap) / 60.0 AS longest_quiet_min,
        count(*) FILTER (WHERE gap IS NOT NULL AND dur_ms IS NOT NULL) AS dur_pairs,
        count(*) FILTER (
          WHERE gap < (dur_ms / 1000.0) * ${env.SWEEP_BURST_FAST_FRACTION}
        ) AS fast_pairs
      FROM recent
      GROUP BY user_id
    )
    SELECT
      u.did,
      u.handle,
      a.n::int AS n,
      a.distinct_tracks::int AS distinct_tracks,
      round(a.longest_quiet_min)::int AS longest_quiet_min,
      round(100.0 * a.fast_pairs / a.dur_pairs)::int AS fast_pct
    FROM agg a
    JOIN users u ON u.xata_id = a.user_id
    WHERE a.n >= ${env.SWEEP_BURST_MIN_SCROBBLES}
      AND a.longest_quiet_min < ${env.SWEEP_BURST_MAX_QUIET_MIN}
      AND a.dur_pairs >= ${env.SWEEP_BURST_MIN_SCROBBLES} / 2
      AND (100.0 * a.fast_pairs / a.dur_pairs) >= ${env.SWEEP_BURST_MIN_FAST_PCT}
      AND u.is_bot = false
    ORDER BY fast_pct DESC
  `);

  return (result.rows as Array<Record<string, unknown>>).map((r) => {
    const c = r as {
      did: string;
      handle: string;
      n: number;
      distinct_tracks: number;
      longest_quiet_min: number;
      fast_pct: number;
    };
    return {
      detector: "burst" as const,
      did: c.did,
      handle: c.handle,
      reason:
        `auto-flagged by scrobble-abuse-sweep (burst): ${c.n} scrobbles / ` +
        `${env.SWEEP_LOOKBACK_HOURS}h across ${c.distinct_tracks} tracks, ` +
        `${c.fast_pct}% logged faster than ${env.SWEEP_BURST_FAST_FRACTION}× the ` +
        `track's own length, longest quiet ${c.longest_quiet_min}min`,
      evidence:
        `n=${c.n} tracks=${c.distinct_tracks} fast=${c.fast_pct}% ` +
        `quiet=${c.longest_quiet_min}min`,
    };
  });
}

/**
 * Run both detectors and merge their candidates, de-duplicated by DID. A user
 * matching both is reported once — the round-the-clock reason wins since it is
 * the stronger, longer-horizon signal.
 */
export async function detectBots(): Promise<BotCandidate[]> {
  const [roundTheClock, burst] = await Promise.all([
    detectRoundTheClockBots(),
    detectBurstBots(),
  ]);

  const byDid = new Map<string, BotCandidate>();
  for (const c of [...roundTheClock, ...burst]) {
    if (!byDid.has(c.did)) byDid.set(c.did, c);
  }
  return [...byDid.values()];
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
      SET is_bot = true, bot_flagged_at = now(), bot_reason = ${c.reason}
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
    consola.warn(`  [${c.detector}] ${c.handle} (${c.did}) — ${c.evidence}`);
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
