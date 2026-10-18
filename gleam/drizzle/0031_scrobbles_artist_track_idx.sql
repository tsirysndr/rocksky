-- An artist's popular tracks are ranked by counting that artist's scrobbles,
-- grouped by track. The only index with artist_id in the lead is
-- `scrobbles_artist_id_idx` (artist_id alone), so the group-by reads the heap
-- for every row to get track_id and user_id:
--
--   GroupAggregate  (actual rows=8064)
--     ->  Sort  Sort Key: s.track_id, s.user_id  (actual rows=39826)
--           ->  Index Scan using scrobbles_artist_id_idx on scrobbles s
--                 Buffers: shared hit=69801 read=28661
--                 I/O Timings: shared read=9477
--   Execution Time: 9694 ms
--
-- 28,661 blocks off disk for 39,826 scrobbles, and that is the warm case; the
-- same query cold took 24 seconds — past the handler's 10s timeout, which
-- renders the section empty. Covering (artist_id, track_id, user_id) answers
-- it from the index alone: no heap, no sort, both aggregates included.
--
-- `scrobbles_artist_id_timestamp_idx` (0029) cannot serve it — timestamp in
-- second position leaves track_id off the index entirely.
--
-- CONCURRENTLY because every scrobble writes this table; it cannot run inside
-- a transaction, hence the statement standing alone.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "scrobbles_artist_track_user_idx"
  ON "scrobbles" USING btree ("artist_id", "track_id", "user_id");
