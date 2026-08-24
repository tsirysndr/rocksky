/**
 * Backfill `tracks.uri` for rows the scrobble ingest path left NULL.
 *
 * `tracks.uri` only ever comes from an `app.rocksky.song` record. The scrobble
 * path in jetstream (`save_track`) inserts its row with `uri = NULL` because an
 * `app.rocksky.scrobble` commit carries no song at-uri, and jetstream handles
 * every commit in its own task — so the scrobble for a listen can beat the song
 * record that was published just before it. When that happened, the song
 * handler's INSERT tripped the `sha256` unique constraint, aborted its whole
 * transaction, and `update_track_uri` (which does the backfill) never ran. The
 * row then stayed uri-less until the track happened to be scrobbled again.
 *
 * The race itself is fixed in `crates/jetstream/src/repo.rs` (the INSERT now
 * carries `ON CONFLICT (sha256) DO UPDATE SET uri = COALESCE(...)`); this
 * script repairs the rows stranded before that landed.
 *
 * Two passes, cheapest first:
 *   1. DB — copy `user_tracks.uri` onto the track when the song record is
 *      already recorded there but never made it to `tracks`.
 *   2. PDS — page `app.rocksky.song` for the users who scrobbled the remaining
 *      rows, hash `title - artist - album` the same way ingest does, and fill
 *      in whatever matches.
 *
 * Anything still NULL after pass 2 has no song record on any PDS we looked at —
 * the publish failed at scrobble time (PDS rate limit, transient 5xx) and it
 * self-heals the next time the track is scrobbled, since `scrobbleTrack` calls
 * `putSongRecord` whenever the stored track has no uri.
 *
 * Usage (also wired as `bun backfill:track-uri`):
 *   tsx ./src/scripts/backfill-track-uri.ts
 *
 * Env overrides:
 *   BACKFILL_URI_DRY_RUN    "1" to report what would change without writing
 *   BACKFILL_URI_ALL_USERS  "1" to crawl every user, not just the ones linked
 *                           to a NULL-uri track (needed for tracks whose only
 *                           scrobble has since been deleted)
 *   BACKFILL_URI_CONCURRENCY  parallel PDS crawlers (default 4)
 */

import { AtpAgent } from "@atproto/api";
import chalk from "chalk";
import { consola } from "consola";
import drizzleClient from "drizzle";
import { isNull, sql } from "drizzle-orm";
import extractPdsFromDid from "lib/extractPdsFromDid";
import { createHash } from "node:crypto";
import tables from "schema";

const { db } = drizzleClient;

const DRY_RUN = process.env.BACKFILL_URI_DRY_RUN === "1";
const ALL_USERS = process.env.BACKFILL_URI_ALL_USERS === "1";
const CONCURRENCY = Number(process.env.BACKFILL_URI_CONCURRENCY ?? 4);

/** Same digest ingest uses to key a track — see `save_track` in jetstream. */
function trackHash(title: string, artist: string, album: string): string {
  return createHash("sha256")
    .update(`${title} - ${artist} - ${album}`.toLowerCase())
    .digest("hex");
}

async function countNullUri(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tables.tracks)
    .where(isNull(tables.tracks.uri))
    .execute();
  return row?.n ?? 0;
}

/**
 * Pass 1 — `user_tracks.uri` is the song record's at-uri, so when it is present
 * and the track is not, the song handler ran far enough to link the user but
 * lost its own write. `WHERE tracks.uri IS NULL` keeps the first publisher's
 * uri authoritative; the `NOT EXISTS` guard keeps us off the unique index when
 * some other row already claims that uri.
 */
async function backfillFromUserTracks(): Promise<number> {
  const statement = sql`
    UPDATE tracks t
    SET uri = ut.uri
    FROM user_tracks ut
    WHERE ut.track_id = t.xata_id
      AND t.uri IS NULL
      AND ut.uri LIKE 'at://%/app.rocksky.song/%'
      AND NOT EXISTS (SELECT 1 FROM tracks o WHERE o.uri = ut.uri)
  `;

  if (DRY_RUN) {
    const [row] = await db
      .execute(sql`
        SELECT count(*)::int AS n
        FROM tracks t
        JOIN user_tracks ut ON ut.track_id = t.xata_id
        WHERE t.uri IS NULL
          AND ut.uri LIKE 'at://%/app.rocksky.song/%'
          AND NOT EXISTS (SELECT 1 FROM tracks o WHERE o.uri = ut.uri)
      `)
      .then((r) => r.rows as { n: number }[]);
    return row?.n ?? 0;
  }

  const result = await db.execute(statement);
  return result.rowCount ?? 0;
}

type Wanted = Map<string, string>; // sha256 -> track xata_id

async function loadWantedHashes(): Promise<Wanted> {
  const rows = await db
    .select({ id: tables.tracks.id, sha256: tables.tracks.sha256 })
    .from(tables.tracks)
    .where(isNull(tables.tracks.uri))
    .execute();

  return new Map(rows.map((r) => [r.sha256, r.id]));
}

async function loadCandidateDids(): Promise<string[]> {
  const query = ALL_USERS
    ? sql`SELECT did FROM users WHERE did IS NOT NULL`
    : sql`
        SELECT DISTINCT u.did
        FROM users u
        WHERE u.did IS NOT NULL
          AND (
            EXISTS (
              SELECT 1 FROM scrobbles s
              JOIN tracks t ON t.xata_id = s.track_id
              WHERE s.user_id = u.xata_id AND t.uri IS NULL
            )
            OR EXISTS (
              SELECT 1 FROM user_tracks ut
              JOIN tracks t ON t.xata_id = ut.track_id
              WHERE ut.user_id = u.xata_id AND t.uri IS NULL
            )
          )
      `;

  const result = await db.execute(query);
  return (result.rows as { did: string }[]).map((r) => r.did);
}

/**
 * Page a repo's `app.rocksky.song` collection, keeping only the records whose
 * hash is one we still need. A repo can hold tens of thousands of songs, so we
 * never accumulate the ones we don't care about.
 */
async function collectSongUris(
  did: string,
  wanted: Wanted,
  found: Map<string, string>,
): Promise<number> {
  const serviceEndpoint = await extractPdsFromDid(did);
  if (!serviceEndpoint) {
    consola.warn(`No PDS for ${chalk.cyan(did)} — skipping`);
    return 0;
  }

  const agent = new AtpAgent({ service: serviceEndpoint });
  let cursor: string | undefined;
  let hits = 0;
  let scanned = 0;

  do {
    const res = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: "app.rocksky.song",
      limit: 100,
      cursor,
    });

    for (const record of res.data.records) {
      const value = record.value as {
        title?: string;
        artist?: string;
        album?: string;
      };
      if (!value.title || !value.artist) continue;

      const hash = trackHash(value.title, value.artist, value.album ?? "");
      if (!wanted.has(hash) || found.has(hash)) continue;

      found.set(hash, record.uri);
      hits += 1;
    }

    scanned += res.data.records.length;
    cursor = res.data.cursor;
    if (!res.data.records.length) break;
  } while (cursor);

  consola.info(
    `${chalk.cyan(did)}: scanned ${chalk.greenBright(scanned)} song records, ${chalk.yellow(hits)} match a uri-less track`,
  );
  return hits;
}

async function applyFound(found: Map<string, string>): Promise<number> {
  let applied = 0;

  for (const [hash, uri] of found) {
    if (DRY_RUN) {
      applied += 1;
      continue;
    }
    try {
      const result = await db.execute(sql`
        UPDATE tracks
        SET uri = ${uri}
        WHERE sha256 = ${hash}
          AND uri IS NULL
          AND NOT EXISTS (SELECT 1 FROM tracks o WHERE o.uri = ${uri})
      `);
      applied += result.rowCount ?? 0;
    } catch (err) {
      consola.warn(`Failed to set ${chalk.cyan(uri)} on ${hash}: ${err}`);
    }
  }

  return applied;
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        try {
          await worker(items[index], index);
        } catch (err) {
          consola.warn(`Worker failed on item ${index}: ${err}`);
        }
      }
    }),
  );
}

async function main() {
  if (DRY_RUN) consola.info(chalk.yellow("Dry run — no writes will be made"));

  const before = await countNullUri();
  consola.info(`${chalk.yellow(before)} tracks with a NULL uri`);

  const fromUserTracks = await backfillFromUserTracks();
  consola.success(
    `Pass 1 (user_tracks): ${chalk.greenBright(fromUserTracks)} tracks ${DRY_RUN ? "would be" : ""} filled`,
  );

  const wanted = await loadWantedHashes();
  if (wanted.size === 0) {
    consola.success("Nothing left to backfill");
    return;
  }

  const dids = await loadCandidateDids();
  consola.info(
    `Pass 2 (PDS): crawling ${chalk.cyan(dids.length)} repos for ${chalk.yellow(wanted.size)} missing songs`,
  );

  const found = new Map<string, string>();
  await mapWithConcurrency(dids, CONCURRENCY, async (did) => {
    await collectSongUris(did, wanted, found);
  });

  const applied = await applyFound(found);
  consola.success(
    `Pass 2 (PDS): ${chalk.greenBright(applied)} tracks ${DRY_RUN ? "would be" : ""} filled`,
  );

  const after = DRY_RUN ? before - fromUserTracks - applied : await countNullUri();
  consola.info(
    `${chalk.yellow(after)} tracks still have a NULL uri — no song record exists for them on any crawled PDS. ` +
      "They pick one up the next time they are scrobbled, since scrobbleTrack republishes when the stored track has no uri.",
  );
}

await main();
process.exit(0);
