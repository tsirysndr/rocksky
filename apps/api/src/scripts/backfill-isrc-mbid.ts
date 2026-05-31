/**
 * Backfill tracks.mb_id and tracks.isrc using MusicBrainz /hydrate and the
 * Spotify Search API.
 *
 * - Walks every track row where either `mb_id` or `isrc` is NULL.
 * - For Spotify, draws a random *active* refresh token from
 *   `spotify_tokens` ⨝ `spotify_accounts (isBetaUser = true)` ⨝ `spotify_apps`
 *   for each access-token mint, then caches the access token per app to
 *   stretch its 60-minute lifetime.
 * - Throttles Spotify to stay well under their rate window and honors
 *   `429 Retry-After` when it shows up anyway. MusicBrainz hydrate gets a
 *   smaller fixed pacing on top.
 *
 * Usage (also wired as `bun isrc:backfill`):
 *   tsx ./src/scripts/backfill-isrc-mbid.ts
 *
 * Env overrides:
 *   BACKFILL_PAGE_SIZE     rows fetched per DB page (default 500)
 *   BACKFILL_CONCURRENCY   parallel workers (default 4)
 *   BACKFILL_SPOTIFY_DELAY ms between Spotify requests per worker (default 250)
 *   BACKFILL_MB_DELAY      ms between MusicBrainz requests per worker (default 1100)
 *   BACKFILL_LIMIT         stop after this many rows (default: no cap)
 *   BACKFILL_ONLY          "mbid" | "isrc" | "both" — which field to fill (default both)
 *   BACKFILL_ARTIST        substring match (ILIKE) — only tracks whose artist
 *                          contains this. Combine with BACKFILL_ALBUM to scope
 *                          a single release. Omit to walk all tracks.
 *   BACKFILL_ALBUM         substring match (ILIKE) on the album column.
 */

import chalk from "chalk";
import { consola } from "consola";
import { ctx } from "context";
import { and, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { decrypt } from "lib/crypto";
import { env } from "lib/env";
import type { MusicbrainzTrack } from "types/track";
import tables from "schema";

const PAGE_SIZE = Number(process.env.BACKFILL_PAGE_SIZE ?? 500);
const CONCURRENCY = Number(process.env.BACKFILL_CONCURRENCY ?? 4);
const SPOTIFY_DELAY_MS = Number(process.env.BACKFILL_SPOTIFY_DELAY ?? 250);
const MB_DELAY_MS = Number(process.env.BACKFILL_MB_DELAY ?? 1100);
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

type AppToken = {
  appId: string;
  appSecret: string;
  refreshToken: string;
};

type CachedToken = {
  accessToken: string;
  expiresAt: number;
};

const accessTokenCache = new Map<string, CachedToken>();
// Apps whose refresh token blew up (invalid_grant, revoked, etc.) — keep them
// out of the random pool so we don't keep grinding on a dead token.
const deadAppIds = new Set<string>();
let activeTokens: AppToken[] = [];

async function loadActiveSpotifyTokens(): Promise<AppToken[]> {
  const rows = await ctx.db
    .select({
      refreshToken: tables.spotifyTokens.refreshToken,
      appId: tables.spotifyApps.spotifyAppId,
      appSecret: tables.spotifyApps.spotifySecret,
    })
    .from(tables.spotifyTokens)
    .innerJoin(
      tables.spotifyApps,
      eq(tables.spotifyApps.spotifyAppId, tables.spotifyTokens.spotifyAppId),
    )
    .innerJoin(
      tables.spotifyAccounts,
      eq(tables.spotifyAccounts.userId, tables.spotifyTokens.userId),
    )
    .where(eq(tables.spotifyAccounts.isBetaUser, true))
    .execute();

  return rows
    .filter((r) => r.refreshToken && r.appId && r.appSecret)
    .map((r) => ({
      appId: r.appId,
      appSecret: decrypt(r.appSecret, env.SPOTIFY_ENCRYPTION_KEY),
      refreshToken: decrypt(r.refreshToken, env.SPOTIFY_ENCRYPTION_KEY),
    }));
}

function livePool(): AppToken[] {
  return activeTokens.filter((t) => !deadAppIds.has(t.appId));
}

function pickRandomToken(excludeAppIds: Set<string>): AppToken | undefined {
  const pool = livePool().filter((t) => !excludeAppIds.has(t.appId));
  if (pool.length === 0) return undefined;
  return pool[Math.floor(Math.random() * pool.length)];
}

function markDead(appId: string, reason: string) {
  if (deadAppIds.has(appId)) return;
  deadAppIds.add(appId);
  accessTokenCache.delete(appId);
  const remaining = livePool().length;
  consola.warn(
    `[spotify] dropping app ${chalk.dim(appId)} from pool (${reason}); ${chalk.cyan(remaining)} token(s) remain`,
  );
}

/**
 * Mint (or reuse) an access token for `tok`. Returns `null` if this specific
 * refresh token can't be made to work right now. Callers should rotate to a
 * different token rather than retry the same one.
 */
async function mintAccessToken(tok: AppToken): Promise<string | null> {
  const cached = accessTokenCache.get(tok.appId);
  // Mint slightly before expiry so concurrent workers don't race a 401.
  if (cached && cached.expiresAt - Date.now() > 60_000) {
    return cached.accessToken;
  }

  let res: Response;
  try {
    res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tok.refreshToken,
        client_id: tok.appId,
        client_secret: tok.appSecret,
      }),
    });
  } catch (err) {
    // Transient network failure — don't retire the token, just let the next
    // call try again.
    consola.warn(
      `[spotify] token refresh network error for app ${chalk.dim(tok.appId)}: ${(err as Error).message}`,
    );
    return null;
  }

  if (res.ok) {
    const json = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    accessTokenCache.set(tok.appId, {
      accessToken: json.access_token,
      expiresAt: Date.now() + json.expires_in * 1000,
    });
    return json.access_token;
  }

  // Inspect the body so we can tell "this refresh token is dead forever" apart
  // from "Spotify hiccupped, try again."
  let errorCode = "";
  try {
    const body = (await res.json()) as { error?: string };
    errorCode = body.error ?? "";
  } catch {
    /* body wasn't JSON — fall through to status-based decision */
  }

  const permanent =
    res.status === 400 ||
    res.status === 401 ||
    errorCode === "invalid_grant" ||
    errorCode === "invalid_client";

  if (permanent) {
    markDead(
      tok.appId,
      `refresh failed ${res.status}${errorCode ? ` ${errorCode}` : ""}`,
    );
  } else {
    consola.warn(
      `[spotify] token refresh transient failure for app ${chalk.dim(tok.appId)} → ${res.status}`,
    );
  }
  return null;
}

/**
 * Walk random tokens until one mints successfully. Each token gets one
 * attempt per call — `mintAccessToken` already handles its own caching and
 * permanent-failure bookkeeping.
 */
async function getAccessToken(): Promise<{
  token: string;
  appId: string;
} | null> {
  const tried = new Set<string>();
  const cap = livePool().length;
  if (cap === 0) return null;
  for (let i = 0; i < cap; i++) {
    const tok = pickRandomToken(tried);
    if (!tok) return null;
    tried.add(tok.appId);
    const access = await mintAccessToken(tok);
    if (access) return { token: access, appId: tok.appId };
  }
  return null;
}

function buildSpotifyQuery(title: string, artist: string): string {
  const cleanTitle = title.replace(/"/g, "");
  const primaryArtist = artist
    .split(/,|;| x | feat\.? | ft\.? /i)[0]
    .trim()
    .replace(/"/g, "");
  return `track:"${cleanTitle}" artist:"${primaryArtist}"`;
}

type SpotifyTrackHit = {
  id: string;
  external_ids?: { isrc?: string };
  external_urls?: { spotify?: string };
  artists: { name: string }[];
  name: string;
};

async function searchSpotify(
  title: string,
  artist: string,
): Promise<SpotifyTrackHit | null> {
  const q = buildSpotifyQuery(title, artist);
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=1`;

  // Two nested loops:
  //   - outer: rotate through tokens. Switching tokens after 401/403 covers
  //     refresh tokens that lasted long enough to mint but the access token
  //     was revoked, scope changes, or the app got rate-throttled.
  //   - inner: for the *current* token, retry on 429 / transient 5xx using
  //     Retry-After + exponential backoff.
  const triedTokens = new Set<string>();
  const maxTokenAttempts = Math.max(3, livePool().length);

  for (let tokenAttempt = 0; tokenAttempt < maxTokenAttempts; tokenAttempt++) {
    const minted = await getAccessToken();
    if (!minted) {
      consola.warn("[spotify] no usable tokens left in pool");
      return null;
    }
    if (triedTokens.has(minted.appId)) {
      // Same app came back — give up rotating, the pool is too small.
      break;
    }
    triedTokens.add(minted.appId);
    const { token, appId } = minted;

    for (let attempt = 0; attempt < 4; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (err) {
        consola.warn(
          `[spotify] search network error (attempt ${attempt + 1}/4): ${(err as Error).message}`,
        );
        await sleep(500 * 2 ** attempt);
        continue;
      }

      if (res.status === 429) {
        const retry = Number(res.headers.get("retry-after") ?? "1");
        const waitMs = retry * 1000 + Math.floor(Math.random() * 500);
        consola.warn(
          `[spotify] 429 — sleeping ${chalk.yellow(`${waitMs}ms`)} (attempt ${attempt + 1}/4)`,
        );
        await sleep(waitMs);
        continue;
      }

      if (res.status === 401 || res.status === 403) {
        // Access token went bad mid-flight — invalidate it and try another
        // app on the next outer iteration.
        accessTokenCache.delete(appId);
        consola.warn(
          `[spotify] ${res.status} on search — rotating away from app ${chalk.dim(appId)}`,
        );
        break;
      }

      if (res.status >= 500 && res.status < 600) {
        const waitMs = 500 * 2 ** attempt;
        consola.warn(
          `[spotify] ${res.status} — backing off ${chalk.yellow(`${waitMs}ms`)} (attempt ${attempt + 1}/4)`,
        );
        await sleep(waitMs);
        continue;
      }

      if (!res.ok) {
        consola.warn(
          `[spotify] search ${res.status} for "${title}" — ${artist}`,
        );
        return null;
      }

      const data = (await res.json()) as {
        tracks?: { items?: SpotifyTrackHit[] };
      };
      const hit = data.tracks?.items?.[0];
      if (!hit) return null;

      // Confirm artist looks plausible — protects against unrelated hits when
      // the title is generic ("Home", "Stay", etc.).
      const wanted = artist.toLowerCase();
      const got = hit.artists.map((a) => a.name.toLowerCase());
      const matches = got.some(
        (g) => wanted.includes(g) || g.includes(wanted.split(",")[0].trim()),
      );
      if (!matches) return null;
      return hit;
    }
  }

  consola.warn(`[spotify] exhausted token rotation for "${title}" — ${artist}`);
  return null;
}

async function lookupMusicBrainz(
  title: string,
  artist: string,
  album: string | null,
): Promise<string | null> {
  try {
    const artistList = artist
      .replace(/;/g, ",")
      .split(",")
      .map((a) => ({ name: a.trim() }))
      .filter((a) => a.name.length > 0);

    const { data } = await ctx.musicbrainz.post<MusicbrainzTrack>("/hydrate", {
      artist: artistList,
      name: title,
      album: album ?? undefined,
    });
    if (data?.trackMBID) return data.trackMBID;

    if (album) {
      // Retry without album — sometimes MB hydrate fails when the album
      // string is a remaster/edition the recording isn't tagged under.
      const { data: d2 } = await ctx.musicbrainz.post<MusicbrainzTrack>(
        "/hydrate",
        { artist: artistList, name: title },
      );
      return d2?.trackMBID ?? null;
    }
    return null;
  } catch (err) {
    consola.warn(
      `[musicbrainz] hydrate failed for "${title}" — ${artist}: ${(err as Error).message}`,
    );
    return null;
  }
}

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

  if (FILL_MBID && !row.mbId) {
    consola.info(`[mb]  → hydrate ${label}`);
    const mb = await lookupMusicBrainz(row.title, row.artist, row.album);
    if (mb) {
      updates.mbId = mb;
      consola.info(`[mb]  ✓ ${label} → ${chalk.green(mb)}`);
    } else {
      consola.info(`[mb]  · ${label} → no match`);
    }
    await sleep(MB_DELAY_MS);
  }

  if (FILL_ISRC && !row.isrc) {
    consola.info(`[spo] → search ${label}`);
    const hit = await searchSpotify(row.title, row.artist);
    const isrc = hit?.external_ids?.isrc;
    if (isrc) {
      updates.isrc = isrc;
      consola.info(`[spo] ✓ ${label} → ${chalk.green(isrc)}`);
    } else {
      consola.info(`[spo] · ${label} → no match`);
    }
    await sleep(SPOTIFY_DELAY_MS);
  }

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

/** Run the UPDATE; on a UNIQUE-violation against isrc (the only UNIQUE
 *  column on tracks for these two fields — mb_id is allowed to repeat
 *  across rows since one MusicBrainz recording can map to several local
 *  tracks), retry without isrc so we still land the mb_id value.
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
    const isUnique = cause.code === "23505";
    const isrcConflict =
      isUnique && (cause.constraint?.includes("isrc") ?? true);

    consola.warn(
      `[db] update failed for ${chalk.dim(row.id)} (${row.title}): ${
        (err as Error).message
      }${
        cause.code
          ? ` | pg ${cause.code}${cause.constraint ? ` constraint=${cause.constraint}` : ""}${cause.detail ? ` detail=${cause.detail}` : ""}`
          : ""
      }`,
    );

    // If isrc was the offender and we also have an mb_id, drop isrc and
    // retry so the mb_id still lands.
    if (isrcConflict && updates.isrc && updates.mbId) {
      const fallback = { mbId: updates.mbId };
      try {
        await ctx.db
          .update(tables.tracks)
          .set(fallback)
          .where(eq(tables.tracks.id, row.id))
          .execute();
        consola.info(
          `[db] ${chalk.dim(row.id)} retried without isrc (already owned elsewhere) — mb_id still applied`,
        );
        return { skipped: false, applied: fallback };
      } catch (e2) {
        consola.warn(
          `[db] mb_id-only retry also failed for ${chalk.dim(row.id)}: ${(e2 as Error).message}`,
        );
      }
    }
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

  if (FILL_ISRC) {
    consola.info("Loading active Spotify tokens…");
    activeTokens = await loadActiveSpotifyTokens();
    if (activeTokens.length === 0) {
      consola.warn(
        "No active Spotify tokens (no beta users with linked accounts) — ISRC backfill will skip every row.",
      );
    } else {
      consola.info(
        `Loaded ${chalk.cyan(activeTokens.length)} active Spotify token(s).`,
      );
    }
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
      `Spotify pool: ${chalk.cyan(livePool().length)} live / ${chalk.dim(`${deadAppIds.size} retired`)}`,
      `Duration:     ${Math.round(totalSec)}s (${(stats.processed / totalSec).toFixed(1)}/s)`,
    ].join("\n"),
  );

  process.exit(0);
}

main().catch((err) => {
  consola.error(err);
  process.exit(1);
});
