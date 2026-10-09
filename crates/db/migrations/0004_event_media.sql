-- The SQLite half of apps/api/drizzle/0045_event_media.sql.

ALTER TABLE events ADD COLUMN media TEXT;
