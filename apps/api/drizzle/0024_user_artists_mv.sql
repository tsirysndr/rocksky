-- getActorNeighbours ("circles") aggregated the 1.5M-row scrobbles table on
-- every cache miss (~6s for heavy listeners). It only needs distinct
-- (user, artist) pairs — ~124k rows — so precompute them. The xrpc server
-- refreshes this view periodically; REFRESH CONCURRENTLY requires the
-- unique index.
CREATE MATERIALIZED VIEW IF NOT EXISTS user_artists_mv AS
SELECT
  s.user_id,
  s.artist_id,
  count(*)::int AS play_count
FROM scrobbles s
JOIN artists a ON a.xata_id = s.artist_id
WHERE a.name NOT ILIKE 'Various Artists'
GROUP BY s.user_id, s.artist_id;

CREATE UNIQUE INDEX IF NOT EXISTS user_artists_mv_user_artist_idx
  ON user_artists_mv (user_id, artist_id);

CREATE INDEX IF NOT EXISTS user_artists_mv_artist_idx
  ON user_artists_mv (artist_id, user_id);
