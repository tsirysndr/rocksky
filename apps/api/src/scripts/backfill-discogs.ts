/**
 * Fill discogs_releases for every album with no Discogs link yet.
 *
 * Walks albums where discogs_release_id is null, oldest first, and asks the
 * Discogs service for each artist+album. Matches are stored and the album is
 * linked; misses are recorded in discogs_searches so a later run skips them.
 *
 * Pacing matters: the service is capped at Discogs' 60 requests per minute per
 * token, and one enrichment costs a search plus a release fetch (plus a master
 * for reissues). So this asks for at most BACKFILL_ALBUMS_PER_MINUTE albums a
 * minute rather than racing the service's queue and collecting 429s, which
 * also leaves quota for live scrobbles sharing the same token. When the
 * service cannot answer at all, that album is retried after a cooldown instead
 * of being recorded as a miss.
 *
 * Usage (also wired as `bun backfill:discogs`):
 *   tsx ./src/scripts/backfill-discogs.ts
 *
 * Env:
 *   DISCOGS_ENRICHMENT_ENABLED  "true" — enable enrichment (default false)
 *   BACKFILL_ALBUMS_PER_MINUTE  albums asked about per minute (default 18)
 *   BACKFILL_LIMIT              stop after this many albums (default: all)
 *   BACKFILL_DRY_RUN            "1" — report what would be asked, write nothing
 */

import chalk from "chalk";
import { consola } from "consola";
import { ctx } from "context";
import { and, asc, count, gt, isNull } from "drizzle-orm";
import { enrichAlbumWithDiscogs } from "lib/discogsEnrichment";
import { env } from "lib/env";
import tables from "schema";
import { retryPgConnection } from "lib/pgConnectionRecovery";

const ALBUMS_PER_MINUTE = Number(process.env.BACKFILL_ALBUMS_PER_MINUTE ?? 18);
const LIMIT = process.env.BACKFILL_LIMIT
  ? Number(process.env.BACKFILL_LIMIT)
  : Number.POSITIVE_INFINITY;
const DRY_RUN = process.env.BACKFILL_DRY_RUN === "1";

const SPACING_MS = Math.ceil(60_000 / Math.max(ALBUMS_PER_MINUTE, 1));
const PAGE_SIZE = 200;
const MAX_ATTEMPTS = 3;
const UNAVAILABLE_COOLDOWN_MS = 60_000;

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, Math.max(ms, 0)));

const formatEta = (seconds: number) => {
  if (!Number.isFinite(seconds)) return "unknown";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

const retryDb = <T>(label: string, run: () => PromiseLike<T>) =>
  retryPgConnection(run, {
    onRetry: (attempt, delayMs) =>
      consola.warn(
        `${label}: database connection lost, retry ${attempt}/5 in ${delayMs / 1000}s`,
      ),
  });

async function main() {
  if (!env.DISCOGS_ENRICHMENT_ENABLED) {
    consola.info(
      "Discogs enrichment is disabled. Set DISCOGS_ENRICHMENT_ENABLED=true to run the backfill.",
    );
    process.exit(0);
  }

  const pending = await retryDb("Count pending albums", () =>
    ctx.db
      .select({ count: count() })
      .from(tables.albums)
      .where(isNull(tables.albums.discogsReleaseId))
      .then((rows) => rows[0]?.count ?? 0),
  );

  const target = Math.min(pending, LIMIT);
  consola.info(
    `${pending} album(s) without a Discogs link · asking ${ALBUMS_PER_MINUTE}/min · ETA ${formatEta((target * SPACING_MS) / 1000)}${DRY_RUN ? " (dry run)" : ""}`,
  );

  let processed = 0;
  let matched = 0;
  let missed = 0;
  let failed = 0;
  let skipped = 0;
  // Keyset cursor: a matched album drops out of the filter, but a miss stays
  // in it, so paging has to move past what has been asked about.
  let cursor: Date | undefined;
  const startedAt = Date.now();

  while (processed < target) {
    const albums = await retryDb("Read album page", () =>
      ctx.db
        .select()
        .from(tables.albums)
        .where(
          cursor
            ? and(
                isNull(tables.albums.discogsReleaseId),
                gt(tables.albums.createdAt, cursor),
              )
            : isNull(tables.albums.discogsReleaseId),
        )
        .orderBy(asc(tables.albums.createdAt))
        .limit(PAGE_SIZE),
    );

    if (albums.length === 0) {
      break;
    }

    for (const album of albums) {
      if (processed >= target) break;

      const label = chalk.cyan(`${album.artist} - ${album.title}`);
      if (DRY_RUN) {
        consola.info(`[${processed + 1}/${target}] would ask for ${label}`);
        cursor = album.createdAt;
        processed++;
        continue;
      }

      // Retrying the entire enrichment replays its upserts and transactional
      // replacements safely; a failed transaction itself must never be reused.
      const enrich = () =>
        retryDb(`Discogs album ${album.id}`, () =>
          enrichAlbumWithDiscogs(ctx, album.artist, album.title, album.id),
        );
      let result = await enrich();
      for (
        let attempt = 1;
        result.status === "unavailable" && attempt < MAX_ATTEMPTS;
        attempt++
      ) {
        consola.warn(
          `discogs unavailable, retrying ${label} in ${formatEta(UNAVAILABLE_COOLDOWN_MS / 1000)}`,
        );
        await sleep(UNAVAILABLE_COOLDOWN_MS);
        result = await enrich();
      }

      cursor = album.createdAt;
      processed++;
      switch (result.status) {
        case "matched":
          matched++;
          consola.success(
            `[${processed}/${target}] ${label} → ${chalk.green(result.release.discogsId)}`,
          );
          break;
        case "missed":
          missed++;
          consola.info(`[${processed}/${target}] ${label} → no match`);
          break;
        case "skipped":
          skipped++;
          consola.info(`[${processed}/${target}] ${label} → incomplete album`);
          break;
        default:
          failed++;
          consola.error(
            `[${processed}/${target}] ${label} → discogs unavailable`,
          );
          break;
      }

      const elapsed = (Date.now() - startedAt) / 1000;
      const rate = processed / elapsed;
      if (processed % 25 === 0) {
        consola.info(
          `progress: ${processed}/${target} · ${matched} matched · ${missed} without a match · ${failed} unavailable · ${(rate * 60).toFixed(1)}/min · ETA ${formatEta((target - processed) / Math.max(rate, 1e-9))}`,
        );
      }

      await sleep(SPACING_MS);
    }
  }

  const elapsed = (Date.now() - startedAt) / 1000;
  consola.success(
    `done in ${formatEta(elapsed)}: ${processed} album(s) · ${matched} matched · ${missed} without a match · ${skipped} incomplete · ${failed} unavailable${DRY_RUN ? " (dry run — nothing written)" : ""}`,
  );
  process.exit(0);
}

main().catch((e) => {
  consola.error(e);
  process.exit(1);
});
