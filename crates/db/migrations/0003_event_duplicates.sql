-- The SQLite half of apps/api/drizzle/0044_event_duplicates.sql.

ALTER TABLE events ADD COLUMN sha256 TEXT;
ALTER TABLE events ADD COLUMN duplicate_of TEXT REFERENCES events (xata_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS events_sha256_idx ON events (sha256);
CREATE INDEX IF NOT EXISTS events_duplicate_of_idx ON events (duplicate_of);
