-- Three tables are read by user_id and indexed only by the other column.
--
-- The profile page counts a listener's library with five of these:
--
--   SELECT COUNT(*) FROM user_tracks  WHERE user_id = $1
--   SELECT COUNT(*) FROM user_albums  WHERE user_id = $1
--   SELECT COUNT(*) FROM loved_tracks WHERE user_id = $1
--
-- and two of them were taking over twenty seconds in production:
--
--   WARN sqlx::query: slow statement: execution time exceeded alert threshold
--   db.statement: SELECT COUNT(*) FROM "user_tracks" WHERE "user_id" = $1
--   elapsed: 22.929302572s
--
-- Not a missing index, quite — a misordered one. `user_tracks` has a unique
-- index on (track_id, user_id) and `user_albums` one on (album_id, user_id).
-- With user_id in second position Postgres will still use them, but only by
-- reading the whole index, since there is no leading-column bound to seek on:
--
--   Index Only Scan using user_tracks_track_user_idx  (actual time=3408ms)
--     Index Cond: (user_id = $1)
--     Buffers: shared hit=13 read=8531
--     I/O Timings: shared read=3376
--
-- 8,531 blocks read to return one number, over 706,219 rows. The 3.4 seconds
-- above is a warm cache; 22.9 is a cold one.
--
-- `loved_tracks` is the same shape for a different reason: it has an index on
-- track_id only, and the profile counts loved songs by user.
--
-- `user_artists` already has `user_artists_user_id_idx` — added in 0003 — and
-- its count was never slow. This is that index, for the two junction tables
-- and the one likes table that did not get it.
--
-- CONCURRENTLY so the build takes no write lock: these tables are on the
-- ingest path and every scrobble touches user_tracks. It cannot run inside a
-- transaction, which is why each statement stands alone.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_tracks_user_id_idx"
  ON "user_tracks" USING btree ("user_id");
--> statement-breakpoint

CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_albums_user_id_idx"
  ON "user_albums" USING btree ("user_id");
--> statement-breakpoint

CREATE INDEX CONCURRENTLY IF NOT EXISTS "loved_tracks_user_id_idx"
  ON "loved_tracks" USING btree ("user_id");
