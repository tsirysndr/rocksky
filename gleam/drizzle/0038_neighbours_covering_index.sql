-- Neighbours needs play_count as well as each shared (artist, user) pair.
-- Replace the old artist-leading index with a covering version so ranking
-- and top shared artists can use the same index-only scan.
-- Run outside a transaction; refreshes and reads can continue during the build.
CREATE INDEX CONCURRENTLY IF NOT EXISTS user_artists_mv_artist_cover_idx
  ON user_artists_mv (artist_id, user_id) INCLUDE (play_count);

DROP INDEX CONCURRENTLY IF EXISTS user_artists_mv_artist_idx;
