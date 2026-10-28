-- Reverse library membership lookups need both IDs without fetching junction rows.
-- Build outside a transaction so uploads and scrobbles can continue during rollout.
CREATE INDEX CONCURRENTLY IF NOT EXISTS album_tracks_track_album_idx ON album_tracks (track_id) INCLUDE (album_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS artist_tracks_track_artist_idx ON artist_tracks (track_id) INCLUDE (artist_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS artist_albums_album_artist_idx ON artist_albums (album_id) INCLUDE (artist_id);
