-- Yearly wrapped aggregates need all three entity IDs for a user's time range.
-- The existing (user_id, timestamp) index forces heap reads for every play;
-- the user-stats index has the IDs but cannot restrict a year by timestamp.
-- Keep this outside a transaction: scrobble ingestion must continue while built.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "scrobbles_wrapped_idx"
  ON "scrobbles" ("user_id", "timestamp", "artist_id", "album_id", "track_id");
