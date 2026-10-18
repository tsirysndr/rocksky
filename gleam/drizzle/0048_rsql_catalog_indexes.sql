-- Apply on the primary outside a transaction; replicas receive these via WAL.
-- Cover exact catalog predicates without scanning large track/album heap rows.
CREATE INDEX CONCURRENTLY IF NOT EXISTS tracks_artist_id_idx ON tracks (artist, xata_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS albums_artist_id_idx ON albums (artist, xata_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS albums_year_id_idx ON albums (year, xata_id);

-- Exact title/range predicates used by the Explore examples.
CREATE INDEX CONCURRENTLY IF NOT EXISTS tracks_title_id_idx ON tracks (title, xata_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS albums_title_id_idx ON albums (title, xata_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS tracks_duration_id_idx ON tracks (duration, xata_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS tracks_track_number_id_idx ON tracks (track_number, xata_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS tracks_disc_number_id_idx ON tracks (disc_number, xata_id);

-- RSQL wildcards compile to lower(column) LIKE lower(pattern), matching these
-- and the existing albums_title_trgm_idx / artists_name_trgm_idx expressions.
CREATE INDEX CONCURRENTLY IF NOT EXISTS tracks_title_trgm_idx ON tracks USING gin (lower(title) gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS tracks_artist_trgm_idx ON tracks USING gin (lower(artist) gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS tracks_album_trgm_idx ON tracks USING gin (lower(album) gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS albums_artist_trgm_idx ON albums USING gin (lower(artist) gin_trgm_ops);

-- Reverse membership lookup for playlist track filters.
CREATE INDEX CONCURRENTLY IF NOT EXISTS playlist_tracks_track_playlist_idx ON playlist_tracks (track_id, playlist_id);

-- Filtered catalog pages are newest-first before bounded listening-count reads.
CREATE INDEX CONCURRENTLY IF NOT EXISTS tracks_catalog_recent_idx ON tracks (xata_createdat DESC, xata_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS albums_catalog_recent_idx ON albums (xata_createdat DESC, xata_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS artists_catalog_recent_idx ON artists (xata_createdat DESC, xata_id);
