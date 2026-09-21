-- getTopScrobblers with a date range aggregated `scrobbles` directly: every row
-- in the window joined to users, grouped per user, with two COUNT(DISTINCT)s on
-- top — a 24MB external merge sort for a one-month window. 670ms warm on the
-- replica, tens of seconds once the heap fell out of cache.
--
-- Roll the table up per user and hour. An hour is the coarsest bucket that
-- still lines up with the ranges the clients send: they are local midnights, so
-- they land on a whole hour in UTC for every timezone with a whole-hour offset.
-- getTopScrobblers covers the leftovers — the partial hours at either end and
-- whatever the view has not caught up on — with live queries narrow enough to
-- ride scrobbles_timestamp_idx.
--
-- artist_keys/track_keys hold hashtext() of the ids rather than the ids: the
-- arrays are only ever counted, and int4 keys halve the view (123MB -> 60MB) and
-- the work of unnesting them. A hash collision would undercount a user by one,
-- at odds of roughly 1 in 10^6 for a few thousand distinct ids.
--
-- The current hour is excluded: the view is refreshed periodically, so a
-- materialised "this hour" would be wrong the moment anyone scrobbled.
-- date_trunc is re-evaluated on each REFRESH, so the boundary moves on its own.
-- The xrpc server refreshes this view periodically; REFRESH CONCURRENTLY
-- requires the unique index.
CREATE MATERIALIZED VIEW IF NOT EXISTS user_hour_scrobbles_mv AS
SELECT
  s.user_id,
  date_trunc('hour', s.timestamp AT TIME ZONE 'UTC') AS hour,
  count(*)::int AS scrobbles,
  array_agg(DISTINCT hashtext(s.artist_id)) FILTER (WHERE s.artist_id IS NOT NULL) AS artist_keys,
  array_agg(DISTINCT hashtext(s.track_id)) FILTER (WHERE s.track_id IS NOT NULL) AS track_keys
FROM scrobbles s
WHERE s.user_id IS NOT NULL
  AND s.timestamp < date_trunc('hour', now())
GROUP BY 1, 2;

CREATE UNIQUE INDEX IF NOT EXISTS user_hour_scrobbles_mv_user_hour_idx
  ON user_hour_scrobbles_mv (user_id, hour);

-- Ranking reads every user's hours in the window and never needs the key
-- arrays, so it stays an index-only scan.
CREATE INDEX IF NOT EXISTS user_hour_scrobbles_mv_hour_idx
  ON user_hour_scrobbles_mv (hour, user_id) INCLUDE (scrobbles);
