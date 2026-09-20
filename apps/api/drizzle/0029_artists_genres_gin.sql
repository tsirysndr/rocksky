-- Every genre feed algo in apps/feeds (rock.ts, hip-hop.ts, vaporwave.ts,
-- ... 51 files total) runs:
--
--   SELECT ... FROM scrobbles
--   INNER JOIN artists ON artists.xata_id = scrobbles.artist_id
--   WHERE artists.genres @> ARRAY['<genre>']
--   ORDER BY scrobbles.timestamp DESC LIMIT $1
--
-- `genres` is a plain text[] column with no index, so `@>` (arrayContains)
-- forces a sequential scan of the whole `artists` table on every genre-feed
-- page load, before the join into `scrobbles` (~1.5M rows, see 0024) even
-- happens, and the result then has to be sorted from scratch since nothing
-- narrows it to an index-ordered scan.
--
-- The GIN index lets the `@>` filter go straight to matching artists. The
-- composite index on scrobbles helps once that filter is applied: for
-- narrower genres, Postgres can walk each matching artist's scrobbles
-- pre-sorted by timestamp instead of resorting the whole filtered set.
--
-- CONCURRENTLY so the build takes no write lock: every scrobble insert
-- touches `scrobbles`, and `artists` is written on backfills/upserts. Cannot
-- run inside a transaction, hence one statement per section.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "artists_genres_gin_idx"
  ON "artists" USING gin ("genres");
--> statement-breakpoint

CREATE INDEX CONCURRENTLY IF NOT EXISTS "scrobbles_artist_id_timestamp_idx"
  ON "scrobbles" USING btree ("artist_id", "timestamp" DESC);
