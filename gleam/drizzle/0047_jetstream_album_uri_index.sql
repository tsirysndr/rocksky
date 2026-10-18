-- Apply outside a transaction on the primary database. Jetstream stamps artist
-- URIs only on albums which have not yet been linked; avoid a catalog-wide scan
-- on every artist event. Existing track lookup indexes already cover their keys.
CREATE INDEX CONCURRENTLY IF NOT EXISTS albums_missing_artist_uri_idx
  ON albums (artist) WHERE artist_uri IS NULL;
