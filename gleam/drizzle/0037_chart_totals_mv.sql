-- All-time charts should rank one row per entity, not aggregate every play on
-- every page request. Refreshed with the other chart views every 30 minutes.
CREATE MATERIALIZED VIEW IF NOT EXISTS chart_artists_mv AS
SELECT artist_id, count(*) AS scrobbles, count(DISTINCT user_id) AS unique_listeners
FROM scrobbles GROUP BY artist_id;

CREATE UNIQUE INDEX IF NOT EXISTS chart_artists_mv_id_idx ON chart_artists_mv (artist_id);
CREATE INDEX IF NOT EXISTS chart_artists_mv_rank_idx ON chart_artists_mv (unique_listeners DESC, artist_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS chart_tracks_mv AS
SELECT track_id, count(*) AS scrobbles, count(DISTINCT user_id) AS unique_listeners
FROM scrobbles GROUP BY track_id;

CREATE UNIQUE INDEX IF NOT EXISTS chart_tracks_mv_id_idx ON chart_tracks_mv (track_id);
CREATE INDEX IF NOT EXISTS chart_tracks_mv_rank_idx ON chart_tracks_mv (unique_listeners DESC, track_id);
