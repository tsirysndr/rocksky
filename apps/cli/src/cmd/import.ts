// Type-only import: erased at runtime so the parse/--dry-run path (and the
// offline smoke tests) never load @rocksky/sdk — which pulls in the native
// classic-level. The runtime values are imported lazily, just before we
// actually authenticate and write (see importCmd).
import type { Agent, RockskyIndex } from "@rocksky/sdk";
import chalk from "chalk";
import { consola } from "consola";
import dayjs from "dayjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { env } from "lib/env";
import {
  ImportFormat,
  ImportedScrobble,
  parseImport,
} from "lib/importParsers";
import {
  Checkpoint,
  ContiguousTracker,
  clearCheckpoint,
  loadCheckpoint,
  resumeIndex,
  saveCheckpoint,
} from "lib/importCheckpoint";

const log = consola.withTag("import");

const VIOLET = chalk.hex("#A855F7");
const CYAN = chalk.hex("#22D3EE");
const TEAL = chalk.hex("#00F5D4");
const RED = chalk.hex("#FF5F87");
const DIM = chalk.dim;

// --- PDS write-limit budget ------------------------------------------------
// Bluesky's PDS rate-limits repo writes by *points*, not requests: ~5,000
// points/hour per account, and each createRecord costs 3 points. Crucially the
// budget is spent per *record written*, so the cap must be expressed in points
// and scaled by how many records each scrobble writes.
//
// As of @rocksky/sdk 0.7.1, publishing one scrobble also materializes the
// canonical metadata it implies — artist, album and song — each written to the
// PDS (deduplicated against the local index) *before* the scrobble record. So a
// single imported scrobble costs up to FOUR createRecord writes in the worst
// case (a brand-new artist + album + song + the scrobble). matchSong remains an
// AppView read (no PDS cost). We size the limiter for that worst case so we can
// never exceed the budget even during a cold-catalog burst where every scrobble
// is a new artist/album/song. WRITES_PER_SCROBBLE keeps that number in one
// place: if the SDK's write fan-out changes again, update it here and the safe
// cap below re-derives automatically.
const HOURLY_WRITE_POINT_BUDGET = 5000; // points/hour the PDS allows for writes
const POINTS_PER_CREATE = 3; // cost of one createRecord
const WRITES_PER_SCROBBLE = 4; // artist + album + song + scrobble (worst case)
const SAFETY_MARGIN = 0.9; // headroom for 429 retries / clock skew

export const POINTS_PER_SCROBBLE = WRITES_PER_SCROBBLE * POINTS_PER_CREATE;
// HARD ceiling: derived from the points budget, so neither the default nor any
// user-supplied `--rate` can ever push past the PDS write limit. (A very large
// import can still reach the ~35k-points/day ceiling; the 429 backoff +
// checkpoint handle that by resuming later.)
const MAX_SAFE_RATE_PER_HOUR = Math.floor(
  (HOURLY_WRITE_POINT_BUDGET * SAFETY_MARGIN) / POINTS_PER_SCROBBLE,
);
const DEFAULT_RATE_PER_HOUR = MAX_SAFE_RATE_PER_HOUR;

/** Coerce a requested rate into the always-safe range [1, MAX_SAFE]. */
export function safeRatePerHour(requested: number | undefined): {
  rate: number;
  capped: boolean;
  requested: number;
} {
  const req = requested ?? DEFAULT_RATE_PER_HOUR;
  // Invalid / non-positive (including the old `--rate 0`) -> the safe default,
  // never "unlimited".
  if (!Number.isFinite(req) || req <= 0) {
    return { rate: DEFAULT_RATE_PER_HOUR, capped: false, requested: req };
  }
  if (req > MAX_SAFE_RATE_PER_HOUR) {
    return { rate: MAX_SAFE_RATE_PER_HOUR, capped: true, requested: req };
  }
  return { rate: req, capped: false, requested: req };
}

export interface ImportOptions {
  dryRun?: boolean;
  format?: string;
  minSeconds?: string;
  limit?: string;
  concurrency?: string;
  rate?: string;
  from?: string;
  to?: string;
  /** Ignore any saved checkpoint and import from the very beginning. */
  restart?: boolean;
}

export async function importCmd(
  file: string,
  opts: ImportOptions = {},
): Promise<void> {
  const format = opts.format?.toLowerCase() as ImportFormat | undefined;
  if (format && format !== "spotify" && format !== "lastfm") {
    log.error(`Unknown --format "${opts.format}". Use "spotify" or "lastfm".`);
    process.exit(1);
  }

  const minSeconds = opts.minSeconds ? Number(opts.minSeconds) : undefined;
  const limit = opts.limit ? Number(opts.limit) : undefined;
  const concurrency = Math.max(1, Number(opts.concurrency) || 4);

  const steps = opts.dryRun ? 2 : 5;

  // ---- Step 1: read & parse -------------------------------------------------
  log.start(`[1/${steps}] Reading export from ${CYAN(file)}${format ? DIM(` (forced ${format})`) : ""}`);

  let result;
  try {
    result = parseImport(file, { force: format, minSeconds });
  } catch (e) {
    log.error(`Could not read the export: ${(e as Error).message}`);
    process.exit(1);
  }

  const label = result.format === "spotify" ? "Spotify" : "Last.fm";
  log.success(
    `Detected ${chalk.bold(label)} export — ` +
      `${chalk.bold(result.scrobbles.length.toLocaleString())} scrobbles ` +
      `across ${result.files.length} file${result.files.length === 1 ? "" : "s"}`,
  );

  // Explain exactly what was skipped and why — nothing silently dropped.
  const skips = Object.entries(result.skipped);
  if (skips.length) {
    log.info(
      `Skipped during parse: ` +
        skips.map(([reason, n]) => `${chalk.bold(n)} ${reason.replace(/-/g, " ")}`).join(", "),
    );
  }

  let scrobbles = result.scrobbles;

  // Optional time-window / count filtering — report the effect of each filter.
  const fromTs = opts.from ? Math.floor(Date.parse(opts.from) / 1000) : undefined;
  const toTs = opts.to ? Math.floor(Date.parse(opts.to) / 1000) : undefined;
  if (fromTs !== undefined && !Number.isFinite(fromTs)) {
    log.error(`Invalid --from date: ${opts.from}`);
    process.exit(1);
  }
  if (toTs !== undefined && !Number.isFinite(toTs)) {
    log.error(`Invalid --to date: ${opts.to}`);
    process.exit(1);
  }
  const beforeFilter = scrobbles.length;
  if (fromTs !== undefined) scrobbles = scrobbles.filter((s) => s.timestamp >= fromTs);
  if (toTs !== undefined) scrobbles = scrobbles.filter((s) => s.timestamp <= toTs);
  if (limit !== undefined && Number.isFinite(limit)) scrobbles = scrobbles.slice(0, limit);
  if (scrobbles.length !== beforeFilter) {
    const parts = [
      opts.from ? `from ${opts.from}` : null,
      opts.to ? `to ${opts.to}` : null,
      limit !== undefined ? `limit ${limit}` : null,
    ].filter(Boolean);
    log.info(
      `Filters (${parts.join(", ")}) narrowed ${beforeFilter.toLocaleString()} → ` +
        `${chalk.bold(scrobbles.length.toLocaleString())} scrobbles`,
    );
  }

  if (scrobbles.length) {
    const first = dayjs.unix(scrobbles[0].timestamp).format("YYYY-MM-DD");
    const last = dayjs.unix(scrobbles[scrobbles.length - 1].timestamp).format("YYYY-MM-DD");
    log.info(`Date range: ${DIM(`${first} → ${last}`)}`);
  }

  if (!scrobbles.length) {
    log.warn("Nothing to import after parsing/filtering.");
    return;
  }

  // ---- Dry run: preview only, never touch the PDS ---------------------------
  // A dry run ALWAYS previews the whole import from the beginning — it never
  // consults (or advances) the resume checkpoint, so you always see the full
  // plan regardless of any earlier partial run.
  if (opts.dryRun) {
    log.start(`[2/${steps}] Dry run — previewing the full import from the start (nothing will be written)`);
    const existing = opts.restart ? null : loadCheckpoint(file);
    if (existing?.cursor) {
      log.info(
        `A resume checkpoint exists (${existing.cursor.count.toLocaleString()} already imported) — ` +
          `a real run would resume after it, but --dry-run always previews from the beginning.`,
      );
    }
    printPreview(scrobbles);
    log.box(
      `${TEAL("Dry run complete")}\n\n` +
        `${chalk.bold(scrobbles.length.toLocaleString())} scrobble(s) would be published (from the start).\n` +
        DIM("Nothing was written to your PDS. Drop --dry-run to import for real."),
    );
    return;
  }

  // Load the SDK lazily — only now that we're past the dry-run and actually
  // about to authenticate and write. Keeps the parse/preview path free of the
  // native classic-level dependency.
  const { Agent, RockskyIndex } = await import("@rocksky/sdk");

  // ---- Step 2: authenticate -------------------------------------------------
  const identifier = env.ROCKSKY_IDENTIFIER || env.ROCKSKY_HANDLE;
  const password = env.ROCKSKY_PASSWORD;
  if (!identifier || !password) {
    log.error(
      "Missing credentials. Set the following in your environment or a .env file:\n" +
        `  ${CYAN("ROCKSKY_IDENTIFIER")}  your handle or DID (e.g. alice.bsky.social)\n` +
        `  ${CYAN("ROCKSKY_PASSWORD")}    an app password (Settings → App Passwords)`,
    );
    process.exit(1);
  }

  log.start(`[2/${steps}] Authenticating as ${CYAN(identifier)} …`);
  let agent: Agent;
  try {
    agent = await Agent.login(identifier, password);
  } catch (e) {
    log.error(`Login failed: ${(e as Error).message}`);
    process.exit(1);
  }
  log.success(`Logged in as ${CYAN(identifier)} ${DIM(agent.did)}`);

  // ---- Step 3: dedup index (+ live Jetstream sync) --------------------------
  // Deduplication is REQUIRED, never optional: without it, a re-run (or an
  // overlap with scrobbles already in your repo) would re-publish records and
  // burn through the PDS write budget. If the index can't be built we abort
  // rather than risk duplicate writes.
  let index: RockskyIndex | undefined;
  // Background firehose sync keeps the dedup index current with scrobbles made
  // from your other apps *while this import runs*, so a long import never
  // re-writes something a concurrent client just published.
  let jetstreamAbort: AbortController | undefined;
  let jetstreamDone: Promise<void> | undefined;
  log.start(`[3/${steps}] Building local dedup index (downloading your repo)…`);
  try {
    const dir = path.join(os.homedir(), ".rocksky", "import-index");
    fs.mkdirSync(dir, { recursive: true });
    index = new RockskyIndex(dir);
    await index.open();
    agent.useIndex(index);
    const stats = await agent.syncRepo();
    log.success(
      `Indexed your existing library — ` +
        `${chalk.bold(stats.scrobbles.toLocaleString())} scrobbles, ${stats.songs} songs, ` +
        `${stats.albums} albums, ${stats.artists} artists. ` +
        DIM("Duplicates will be skipped."),
    );

    // Keep it live off the firehose for the duration of the import.
    jetstreamAbort = new AbortController();
    jetstreamDone = agent
      .hydrateFromJetstream({ signal: jetstreamAbort.signal })
      .catch((e) => log.warn(`Live dedup sync stopped: ${(e as Error).message}`));
    log.info(
      DIM("Live dedup sync started (Jetstream) — the index stays current with your other apps."),
    );
  } catch (e) {
    log.error(
      `Could not build the dedup index: ${(e as Error).message}.\n` +
        "Deduplication is required to avoid re-publishing scrobbles and exceeding PDS " +
        "write limits, so the import has been aborted. Fix the error above and re-run.",
    );
    if (index) await index.close().catch(() => {});
    process.exit(1);
  }

  // Stop the firehose and wait for it to unwind before we touch/close the index.
  const stopJetstream = async () => {
    if (!jetstreamAbort) return;
    jetstreamAbort.abort();
    try {
      await jetstreamDone;
    } catch {
      /* ignore */
    }
    jetstreamAbort = undefined;
  };

  // ---- Step 4: resume from the last imported scrobble -----------------------
  // The checkpoint records the last *contiguously* imported scrobble for this
  // exact source, so a restart skips everything already done — no re-walking,
  // no wasted rate-limit budget — and resumes precisely at the next one.
  log.start(`[4/${steps}] Checking for a resume checkpoint…`);
  if (opts.restart) {
    clearCheckpoint(file);
    log.info("--restart given — ignoring any saved checkpoint, importing from the start.");
  }
  const saved = opts.restart ? null : loadCheckpoint(file);
  const startIndex = resumeIndex(scrobbles, saved?.cursor ?? null);
  const pending = scrobbles.slice(startIndex);

  if (startIndex > 0 && saved?.cursor) {
    const at = dayjs.unix(saved.cursor.timestamp).format("YYYY-MM-DD HH:mm");
    log.success(
      `Resuming — ${chalk.bold(startIndex.toLocaleString())} already imported ` +
        `(last: ${saved.cursor.title} by ${saved.cursor.artist} at ${at}), ` +
        `${chalk.bold(pending.length.toLocaleString())} remaining`,
    );
  } else if (saved?.cursor) {
    log.info("Found a checkpoint but couldn't locate it in this file (source changed?) — starting from the top.");
  } else {
    log.info(`No checkpoint found — importing all ${chalk.bold(pending.length.toLocaleString())} scrobbles.`);
  }

  if (!pending.length) {
    clearCheckpoint(file);
    await stopJetstream();
    if (index) await index.close().catch(() => {});
    log.success("Already fully imported — nothing left to do.");
    return;
  }

  // ---- Step 5: publish ------------------------------------------------------
  const total = pending.length;
  const { rate: ratePerHour, capped, requested } = safeRatePerHour(
    opts.rate !== undefined ? Number(opts.rate) : undefined,
  );
  if (capped) {
    log.warn(
      `--rate ${requested}/h exceeds the safe Bluesky PDS write budget; ` +
        `capping at ${MAX_SAFE_RATE_PER_HOUR}/h.`,
    );
  }
  const gate = new RateGate(Math.ceil(3_600_000 / ratePerHour));
  const eta0 = Math.ceil((total / ratePerHour) * 3600);
  log.start(
    `[5/${steps}] Publishing ${chalk.bold(total.toLocaleString())} scrobble(s) ` +
      DIM(`— match+enrich, concurrency ${concurrency}, ≤${ratePerHour}/h, ~${fmtDuration(eta0)}`),
  );
  log.info(
    DIM(
      `Each scrobble also publishes its artist, album & song (deduped) — up to ` +
        `${WRITES_PER_SCROBBLE} PDS writes, so the rate is capped at ${ratePerHour}/h ` +
        `to stay within Bluesky's ${HOURLY_WRITE_POINT_BUDGET} points/hour write budget.`,
    ),
  );
  if (total > ratePerHour) {
    log.info(
      "Throttled to stay under Bluesky PDS write limits — a large history takes a while. " +
        "Safe to Ctrl-C and re-run: it resumes exactly where it left off.",
    );
  }

  let done = 0;
  let failed = 0;
  const failures: { s: ImportedScrobble; error: string }[] = [];
  const startedAt = Date.now();
  // The scrobble currently being written — shown live on the progress line.
  let current: ImportedScrobble | undefined;

  // Checkpoint bookkeeping: advance across the unbroken completed prefix only.
  const tracker = new ContiguousTracker();
  let lastSaveAt = 0;
  const buildCheckpoint = (): Checkpoint => {
    const m = tracker.mark;
    return {
      source: path.resolve(file),
      format: result.format,
      cursor:
        m >= 0
          ? {
              timestamp: pending[m].timestamp,
              title: pending[m].title,
              artist: pending[m].artist,
              count: startIndex + m + 1,
            }
          : saved?.cursor ?? null,
      updatedAt: new Date().toISOString(),
    };
  };
  const flushCheckpoint = () => {
    if (tracker.mark < 0) return;
    try {
      saveCheckpoint(buildCheckpoint());
      lastSaveAt = Date.now();
    } catch {
      /* a failed checkpoint write is non-fatal; we retry on the next advance */
    }
  };

  // Persist the latest checkpoint on Ctrl-C / termination so a re-run resumes
  // exactly at the next scrobble.
  let interrupted = false;
  const onSignal = () => {
    if (interrupted) return;
    interrupted = true;
    process.stdout.write("\n");
    flushCheckpoint();
    jetstreamAbort?.abort(); // best-effort; we're exiting immediately
    log.warn(
      `Interrupted — checkpoint saved at ${startIndex + tracker.mark + 1} of ${scrobbles.length}. ` +
        "Re-run the same command to resume.",
    );
    process.exit(130);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  const publishOne = async (s: ImportedScrobble, i: number): Promise<void> => {
    // Surface what we're about to write, and refresh the in-place line now.
    current = s;
    renderProgress(done, total, failed, startedAt, current);
    try {
      await withRateLimitRetry(async () => {
        // One gate slot per scrobble reserves the worst-case write fan-out
        // (artist + album + song + scrobble); the SDK dedups so most cost less,
        // but the reservation guarantees we never exceed the PDS points budget.
        await gate.take();
        // Always enrich via matchSong: the exports carry no duration or album
        // art, and scrobbleMatch falls back to a minimal record when there's no
        // match — so this never writes worse metadata than a raw scrobble would.
        await agent.scrobbleMatch({
          title: s.title,
          artist: s.artist,
          album: s.album,
          mbId: s.mbId,
          isrc: s.isrc,
          timestamp: s.timestamp,
        });
      });
      // Only advance the checkpoint on success, so a failure never gets skipped
      // on resume.
      const advanced = tracker.complete(i);
      if (advanced && Date.now() - lastSaveAt > 1500) flushCheckpoint();
    } catch (e) {
      failed++;
      if (failures.length < 20) failures.push({ s, error: (e as Error).message });
    } finally {
      done++;
      renderProgress(done, total, failed, startedAt, current);
    }
  };

  await runPool(pending, concurrency, publishOne);
  process.stdout.write("\n");
  process.off("SIGINT", onSignal);
  process.off("SIGTERM", onSignal);

  // Persist the final position, then clear the checkpoint iff the whole run
  // completed with no gaps (a blocking failure keeps it for the next resume).
  flushCheckpoint();
  const fullyDone = tracker.mark === pending.length - 1;
  if (fullyDone) clearCheckpoint(file);

  await stopJetstream();
  if (index) {
    try {
      await index.close();
    } catch {
      /* ignore */
    }
  }

  // ---- Report ---------------------------------------------------------------
  const ok = total - failed;
  const took = fmtDuration((Date.now() - startedAt) / 1000);
  log.box(
    `${failed ? chalk.yellow("Import finished with errors") : TEAL("Import complete")}\n\n` +
      `${chalk.bold(ok.toLocaleString())}/${total.toLocaleString()} scrobble(s) published in ${took}` +
      (failed ? `\n${RED(`${failed} failed`)}` : "") +
      (fullyDone
        ? ""
        : `\n${DIM(`Checkpoint kept at ${startIndex + tracker.mark + 1}/${scrobbles.length} — re-run to resume.`)}`),
  );
  if (failures.length) {
    log.error(`First ${Math.min(failures.length, 10)} failure(s):`);
    for (const f of failures.slice(0, 10)) {
      log.log(`  ${RED("✖")} ${f.s.title} — ${f.s.artist} ${DIM(`(${f.error})`)}`);
    }
  }

  process.exit(failed && !ok ? 1 : 0);
}

/* -------------------------------------------------------------------------- */
/*  Output helpers                                                            */
/* -------------------------------------------------------------------------- */

function printPreview(scrobbles: ImportedScrobble[]): void {
  const sample = scrobbles.slice(0, 10);
  const lines = sample.map((s) => {
    const when = dayjs.unix(s.timestamp).format("YYYY-MM-DD HH:mm");
    return (
      DIM(when) +
      "  " +
      CYAN(s.title) +
      DIM(" — ") +
      VIOLET(s.artist) +
      (s.album ? DIM(`  · ${s.album}`) : "")
    );
  });
  const more =
    scrobbles.length > sample.length
      ? [DIM(`  … and ${(scrobbles.length - sample.length).toLocaleString()} more`)]
      : [];
  log.log([chalk.bold("Preview (first 10):"), ...lines, ...more].join("\n"));
}

// Eighth-block glyphs give the bar sub-cell resolution for a smooth fill.
const BAR_EIGHTHS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];

/** Truncate a string to `n` visible chars, adding an ellipsis when clipped. */
function truncate(s: string, n: number): string {
  if (n <= 1) return "";
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

/**
 * Single live status line, redrawn in place (\r + clear-to-end-of-line): a
 * smooth progress bar, counts, ETA, and the scrobble currently being written.
 * Everything updates on the same line — nothing scrolls until the run ends.
 */
function renderProgress(
  done: number,
  total: number,
  failed: number,
  startedAt: number,
  current?: ImportedScrobble,
): void {
  const frac = total > 0 ? done / total : 0;
  const pct = Math.floor(frac * 100);
  const width = 20;

  // Smooth fill: full blocks + one fractional block for the remainder.
  const exact = frac * width;
  const full = Math.floor(exact);
  const partial = BAR_EIGHTHS[Math.round((exact - full) * 8)] ?? "";
  const filledStr = "█".repeat(full) + partial;
  const bar =
    TEAL(filledStr) + DIM("─".repeat(Math.max(0, width - filledStr.length)));

  const elapsed = (Date.now() - startedAt) / 1000;
  const rate = elapsed > 0 ? done / elapsed : 0;
  const eta = rate > 0 ? (total - done) / rate : 0;
  const counts = `${done.toLocaleString()}/${total.toLocaleString()}`;

  const head =
    `  ${bar} ${chalk.bold(`${String(pct).padStart(3)}%`)}  ` +
    `${CYAN(counts)}` +
    (failed ? RED(`  ✖${failed}`) : "") +
    DIM(`  ~${fmtDuration(eta)} left`);

  // Append the current track, trimmed to whatever width the terminal leaves.
  let tail = "";
  if (current) {
    // head length without ANSI colour codes ≈ bar(20)+counts+eta ~ 48 chars.
    const cols = process.stdout.columns || 80;
    const room = cols - 52; // conservative space left for the track label
    if (room > 8) {
      const label = `${current.title} — ${current.artist}`;
      tail = "  " + VIOLET("▸ ") + truncate(label, room);
    }
  }

  // \x1b[K clears from the cursor to end of line so a shorter label doesn't
  // leave stale characters behind from a previous, longer one.
  process.stdout.write(`\r${head}${tail}\x1b[K`);
}

function fmtDuration(seconds: number): string {
  const sec = Math.max(0, Math.round(seconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Global throttle: spaces write attempts at least `minIntervalMs` apart across
 * all workers so a bulk import stays under the PDS write budget. A shared
 * `nextAt` cursor is advanced atomically per `take()`, so concurrency never
 * bursts past the configured rate.
 */
class RateGate {
  private nextAt = 0;
  constructor(private minIntervalMs: number) {}
  async take(): Promise<void> {
    if (this.minIntervalMs <= 0) return;
    const now = Date.now();
    const at = Math.max(now, this.nextAt);
    this.nextAt = at + this.minIntervalMs;
    const delay = at - now;
    if (delay > 0) await sleep(delay);
  }
}

/**
 * Retry a write on transient rate-limit errors with exponential backoff. Only
 * rate-limit / 429 errors are retried; anything else propagates immediately.
 */
async function withRateLimitRetry<T>(fn: () => Promise<T>, maxRetries = 6): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      const isRateLimit = /rate.?limit|ratelimit|too many requests|\b429\b/i.test(msg);
      if (!isRateLimit || attempt >= maxRetries) throw e;
      const backoff = Math.min(60_000, 1_000 * 2 ** attempt);
      log.warn(`Rate-limited by the PDS — backing off ${Math.round(backoff / 1000)}s (retry ${attempt + 1}/${maxRetries}).`);
      await sleep(backoff);
      attempt++;
    }
  }
}

/** Run `worker` over `items` with at most `size` concurrent invocations. */
async function runPool<T>(
  items: T[],
  size: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}
