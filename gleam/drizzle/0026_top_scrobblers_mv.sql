-- getTopScrobblers with no date range ("all time") aggregated the whole
-- scrobbles table on every request: a full scan plus two COUNT(DISTINCT)
-- per user. Precompute the per-user totals instead — one row per user.
-- The xrpc server refreshes this view periodically; REFRESH CONCURRENTLY
-- requires the unique index.
CREATE MATERIALIZED VIEW IF NOT EXISTS top_scrobblers_mv AS
SELECT
  s.user_id,
  count(*)::int AS scrobbles,
  count(DISTINCT s.artist_id)::int AS unique_artists,
  count(DISTINCT s.track_id)::int AS unique_tracks
FROM scrobbles s
WHERE s.user_id IS NOT NULL
GROUP BY s.user_id;

CREATE UNIQUE INDEX IF NOT EXISTS top_scrobblers_mv_user_idx
  ON top_scrobblers_mv (user_id);

CREATE INDEX IF NOT EXISTS top_scrobblers_mv_scrobbles_idx
  ON top_scrobblers_mv (scrobbles DESC, user_id);
