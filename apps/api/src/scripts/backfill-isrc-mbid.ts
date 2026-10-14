// Backfill missing identifiers only from a centrally selected match.
import { matchTrack, matchingRequest } from "lib/matching";
import chalk from "chalk";
import { consola } from "consola";
import { ctx } from "context";
import { and, eq, ilike, isNull, or, sql } from "drizzle-orm";
import tables from "schema";

const PAGE_SIZE = Number(process.env.BACKFILL_PAGE_SIZE ?? 500);
const CONCURRENCY = Number(process.env.BACKFILL_CONCURRENCY ?? 4);
const MATCHING_DELAY_MS = Number(process.env.BACKFILL_MATCHING_DELAY ?? 1100);
const LIMIT = process.env.BACKFILL_LIMIT
  ? Number(process.env.BACKFILL_LIMIT)
  : Number.POSITIVE_INFINITY;
const ONLY = (process.env.BACKFILL_ONLY ?? "both").toLowerCase() as
  | "mbid"
  | "isrc"
  | "both";

const FILL_MBID = ONLY === "both" || ONLY === "mbid";
const FILL_ISRC = ONLY === "both" || ONLY === "isrc";

const ARTIST_FILTER = process.env.BACKFILL_ARTIST?.trim() || null;
const ALBUM_FILTER = process.env.BACKFILL_ALBUM?.trim() || null;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Row = {
  id: string;
  title: string;
  artist: string;
  album: string;
  mbId: string | null;
  isrc: string | null;
};

function buildWhere() {
  const clauses = [
    or(
      FILL_MBID ? isNull(tables.tracks.mbId) : sql`false`,
      FILL_ISRC ? isNull(tables.tracks.isrc) : sql`false`,
    ),
  ];
  // Optional scope filters — let the operator backfill just one artist or one
  // album without walking the entire catalog.
  if (ARTIST_FILTER) {
    clauses.push(ilike(tables.tracks.artist, `%${ARTIST_FILTER}%`));
  }
  if (ALBUM_FILTER) {
    clauses.push(ilike(tables.tracks.album, `%${ALBUM_FILTER}%`));
  }
  return and(...clauses);
}

async function fetchPage(offset: number, pageSize: number): Promise<Row[]> {
  const rows = await ctx.db
    .select({
      id: tables.tracks.id,
      title: tables.tracks.title,
      artist: tables.tracks.artist,
      album: tables.tracks.album,
      mbId: tables.tracks.mbId,
      isrc: tables.tracks.isrc,
    })
    .from(tables.tracks)
    .where(buildWhere())
    .orderBy(tables.tracks.createdAt)
    .offset(offset)
    .limit(pageSize)
    .execute();
  return rows;
}

async function countCandidates(): Promise<number> {
  const [row] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(tables.tracks)
    .where(buildWhere())
    .execute();
  return row?.n ?? 0;
}

async function processRow(row: Row): Promise<{ mb: boolean; isrc: boolean }> {
  const label = `${chalk.cyan(row.title)} — ${chalk.dim(row.artist)}`;
  const updates: { mbId?: string; isrc?: string } = {};

  const candidate = await matchTrack(ctx, matchingRequest(row));
  if (candidate) {
    if (FILL_MBID && !row.mbId && candidate.identifiers.musicbrainzRecordingId)
      updates.mbId = candidate.identifiers.musicbrainzRecordingId;
    if (FILL_ISRC && !row.isrc && candidate.identifiers.isrc)
      updates.isrc = candidate.identifiers.isrc;
  }
  await sleep(MATCHING_DELAY_MS);

  if (Object.keys(updates).length === 0) {
    return { mb: false, isrc: false };
  }

  const result = await tryUpdate(row, updates);
  if (result.skipped) {
    return { mb: false, isrc: false };
  }
  consola.success(
    `[db] ${chalk.dim(row.id)} ${label} ${
      result.applied.mbId ? chalk.green(`mb_id=${result.applied.mbId}`) : ""
    } ${result.applied.isrc ? chalk.green(`isrc=${result.applied.isrc}`) : ""}`.trim(),
  );
  return { mb: !!result.applied.mbId, isrc: !!result.applied.isrc };
}

/** Drizzle wraps pg errors and hides `.code` / `.constraint` / `.detail` behind
 *  `err.cause`. Pull them out so logs say something useful.
 */
function pgCause(err: unknown): {
  code?: string;
  constraint?: string;
  detail?: string;
} {
  const e = err as { cause?: unknown };
  if (!e?.cause || typeof e.cause !== "object") return {};
  const c = e.cause as { code?: string; constraint?: string; detail?: string };
  return { code: c.code, constraint: c.constraint, detail: c.detail };
}

/** Neither mb_id nor isrc carry UNIQUE constraints anymore (dropped in
 *  migrations 0011 and 0012), so UPDATE failures should be rare. The
 *  pgCause helper still surfaces whatever the real error is (FK / check /
 *  etc.) so we keep visibility if a new failure mode shows up.
 */
async function tryUpdate(
  row: Row,
  updates: { mbId?: string; isrc?: string },
): Promise<{ skipped: boolean; applied: { mbId?: string; isrc?: string } }> {
  try {
    await ctx.db
      .update(tables.tracks)
      .set(updates)
      .where(eq(tables.tracks.id, row.id))
      .execute();
    return { skipped: false, applied: updates };
  } catch (err) {
    const cause = pgCause(err);
    consola.warn(
      `[db] update failed for ${chalk.dim(row.id)} (${row.title}): ${
        (err as Error).message
      }${
        cause.code
          ? ` | pg ${cause.code}${cause.constraint ? ` constraint=${cause.constraint}` : ""}${cause.detail ? ` detail=${cause.detail}` : ""}`
          : ""
      }`,
    );
    return { skipped: true, applied: {} };
  }
}

type Stats = {
  processed: number;
  mb: number;
  isrc: number;
  failed: number;
  totalTarget: number;
  startedAt: number;
};

function progressLine(stats: Stats): string {
  const elapsedSec = Math.max(1, (Date.now() - stats.startedAt) / 1000);
  const rate = stats.processed / elapsedSec;
  const remaining = Math.max(0, stats.totalTarget - stats.processed);
  const etaSec = rate > 0 ? remaining / rate : 0;
  const etaMin = Math.round(etaSec / 60);
  const pct =
    stats.totalTarget > 0
      ? Math.floor((stats.processed / stats.totalTarget) * 100)
      : 0;
  return `${chalk.bold(`${pct}%`)} ${stats.processed}/${stats.totalTarget} · mb=${chalk.green(stats.mb)} isrc=${chalk.green(stats.isrc)} failed=${chalk.yellow(stats.failed)} · ${rate.toFixed(1)}/s · ETA ~${etaMin}m`;
}

async function worker(id: number, queue: Row[], stats: Stats): Promise<void> {
  consola.info(`[w${id}] start`);
  while (queue.length > 0) {
    if (stats.processed >= LIMIT) return;
    const row = queue.shift();
    if (!row) return;
    stats.processed += 1;
    try {
      const r = await processRow(row);
      if (r.mb) stats.mb += 1;
      if (r.isrc) stats.isrc += 1;
      if (!r.mb && !r.isrc) stats.failed += 1;
    } catch (err) {
      stats.failed += 1;
      consola.error(`[w${id}] error on ${row.id}:`, err);
    }
    if (stats.processed % 25 === 0) {
      consola.info(`[progress] ${progressLine(stats)}`);
    }
  }
  consola.info(`[w${id}] done`);
}

async function main() {
  const scope = [
    ARTIST_FILTER ? `artist~"${ARTIST_FILTER}"` : null,
    ALBUM_FILTER ? `album~"${ALBUM_FILTER}"` : null,
  ]
    .filter(Boolean)
    .join(" ");
  consola.start(
    `Backfill starting · mbid=${FILL_MBID} isrc=${FILL_ISRC}${
      scope ? ` · scope=${scope}` : " · scope=all tracks"
    } · concurrency=${CONCURRENCY} · page=${PAGE_SIZE}`,
  );

  if (!FILL_MBID && !FILL_ISRC) {
    consola.error("BACKFILL_ONLY=neither — nothing to do.");
    process.exit(1);
  }

  consola.info("Counting candidate tracks…");
  const total = await countCandidates();
  const target = Math.min(LIMIT, total);
  consola.info(
    `Found ${chalk.cyan(total)} candidate track(s); will process up to ${chalk.cyan(target)}.`,
  );
  if (target === 0) {
    consola.success("Nothing to backfill — exiting.");
    process.exit(0);
  }

  const stats: Stats = {
    processed: 0,
    mb: 0,
    isrc: 0,
    failed: 0,
    totalTarget: target,
    startedAt: Date.now(),
  };

  let offset = 0;
  let pageNum = 0;

  while (stats.processed < LIMIT) {
    const remaining = LIMIT - stats.processed;
    const pageSize = Math.min(PAGE_SIZE, remaining);
    pageNum += 1;
    consola.info(
      `[page ${pageNum}] fetching offset=${chalk.cyan(offset)} size=${chalk.cyan(pageSize)}`,
    );
    const page = await fetchPage(offset, pageSize);
    if (page.length === 0) {
      consola.info("No more rows. Stopping.");
      break;
    }
    consola.info(
      `[page ${pageNum}] processing ${chalk.cyan(page.length)} row(s) — ${progressLine(stats)}`,
    );

    const queue = [...page];
    const workers = Array.from({ length: CONCURRENCY }, (_, i) =>
      worker(i + 1, queue, stats),
    );
    await Promise.all(workers);

    // Rows we updated are no longer matched by the WHERE filter, so the
    // next page can start at the same offset. Rows we couldn't update stay
    // matched and slide forward — advance by however many we skipped.
    const updatedThisPage = stats.mb + stats.isrc;
    const skipped = page.length - updatedThisPage;
    offset += Math.max(0, skipped);

    consola.info(`[page ${pageNum}] done — ${progressLine(stats)}`);
  }

  const totalSec = Math.max(1, (Date.now() - stats.startedAt) / 1000);
  consola.box(
    [
      `${chalk.bold("Backfill complete")}`,
      `Processed:    ${chalk.cyan(stats.processed)}`,
      `mb_id filled: ${chalk.green(stats.mb)}`,
      `isrc filled:  ${chalk.green(stats.isrc)}`,
      `Skipped:      ${chalk.yellow(stats.failed)}`,
      `Duration:     ${Math.round(totalSec)}s (${(stats.processed / totalSec).toFixed(1)}/s)`,
    ].join("\n"),
  );

  process.exit(0);
}

main().catch((err) => {
  consola.error(err);
  process.exit(1);
});
