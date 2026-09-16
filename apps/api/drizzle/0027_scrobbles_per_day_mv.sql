-- The global scrobbles chart (no did/artist/album/song/genre filter) grouped
-- the whole scrobbles table by day on every request. The default range is six
-- months, so every call scanned millions of rows to rebuild buckets that stop
-- changing the moment their day is over.
--
-- Precompute one row per day. Deliberately excludes the current day: the view
-- is refreshed periodically, so a materialised "today" would be wrong the
-- moment anyone scrobbled. getScrobblesChart unions this with a live query
-- covering only the days the view does not have yet, which rides
-- scrobbles_timestamp_idx.
--
-- CURRENT_DATE is re-evaluated on each REFRESH, so the boundary moves forward
-- on its own. The xrpc server refreshes this view periodically; REFRESH
-- CONCURRENTLY requires the unique index.
CREATE MATERIALIZED VIEW IF NOT EXISTS scrobbles_per_day_mv AS
SELECT
  (s.timestamp)::date AS day,
  count(*)::bigint AS count
FROM scrobbles s
WHERE (s.timestamp)::date < CURRENT_DATE
GROUP BY (s.timestamp)::date;

CREATE UNIQUE INDEX IF NOT EXISTS scrobbles_per_day_mv_day_idx
  ON scrobbles_per_day_mv (day);
