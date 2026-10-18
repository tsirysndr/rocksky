-- Date-filtered charts aggregate only IDs, counts, and distinct listeners.
-- Cover the time window instead of fetching a heap tuple for every play.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "scrobbles_chart_range_idx"
  ON "scrobbles" ("timestamp", "artist_id", "track_id", "user_id");

-- Profile album cards include global unique listeners (optionally in a range).
-- The existing album_id-only index cannot answer that without heap reads.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "scrobbles_album_listeners_idx"
  ON "scrobbles" ("album_id", "timestamp", "user_id");
