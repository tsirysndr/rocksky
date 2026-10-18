-- Apply manually outside a transaction, like the other concurrent-index
-- migrations. Production is missing the URI/Spotify indexes declared as
-- unique in the schema. Use non-unique lookup indexes to avoid imposing a
-- new uniqueness constraint on existing data during this performance fix.
CREATE INDEX CONCURRENTLY IF NOT EXISTS user_tracks_uri_idx
  ON user_tracks (uri);

CREATE INDEX CONCURRENTLY IF NOT EXISTS tracks_spotify_link_idx
  ON tracks (spotify_link);
