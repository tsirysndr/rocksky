-- Apply manually outside a transaction (matching reads from the replica).
-- Every OR branch in catalog retrieval needs a matching expression index;
-- a plain mb_id/isrc index cannot serve LOWER(mb_id) or normalized ISRC.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tracks_lower_title
  ON tracks (lower(title));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tracks_lower_mb_id
  ON tracks (lower(mb_id));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tracks_normalized_isrc
  ON tracks (upper(replace(isrc, '-', '')));
