-- Music events: the SQLite half of apps/api/drizzle/0043_events.sql. Postgres
-- jsonb and text[] columns are JSON text here, timestamps are ISO-8601 text,
-- as everywhere else in this schema.

CREATE TABLE IF NOT EXISTS events (
  xata_id         TEXT PRIMARY KEY,
  uri             TEXT NOT NULL UNIQUE,
  cid             TEXT,
  music_uri       TEXT NOT NULL UNIQUE,
  music_cid       TEXT,
  name            TEXT NOT NULL,
  description     TEXT,
  starts_at       TEXT,
  ends_at         TEXT,
  mode            TEXT,
  status          TEXT,
  locations       TEXT,
  uris            TEXT,
  kind            TEXT,
  genre           TEXT,
  tags            TEXT,
  external_ids    TEXT,
  tickets_url     TEXT,
  image_url       TEXT,
  created_by      TEXT NOT NULL REFERENCES users (xata_id),
  created_at      TEXT,
  xata_createdat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_updatedat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_version    INTEGER
);
CREATE INDEX IF NOT EXISTS events_starts_at_idx ON events (starts_at);
CREATE INDEX IF NOT EXISTS events_created_by_idx ON events (created_by);

CREATE TABLE IF NOT EXISTS event_artists (
  xata_id         TEXT PRIMARY KEY,
  event_id        TEXT NOT NULL REFERENCES events (xata_id) ON DELETE CASCADE,
  artist_id       TEXT NOT NULL REFERENCES artists (xata_id),
  name            TEXT NOT NULL,
  role            TEXT,
  stage           TEXT,
  mbid            TEXT,
  starts_at       TEXT,
  position        INTEGER NOT NULL DEFAULT 0,
  xata_createdat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS event_artists_event_artist_idx ON event_artists (event_id, artist_id);
CREATE INDEX IF NOT EXISTS event_artists_artist_id_idx ON event_artists (artist_id);

CREATE TABLE IF NOT EXISTS event_rsvps (
  xata_id         TEXT PRIMARY KEY,
  event_id        TEXT NOT NULL REFERENCES events (xata_id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users (xata_id),
  uri             TEXT NOT NULL UNIQUE,
  cid             TEXT,
  status          TEXT NOT NULL,
  xata_createdat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_updatedat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS event_rsvps_event_user_idx ON event_rsvps (event_id, user_id);
CREATE INDEX IF NOT EXISTS event_rsvps_user_id_idx ON event_rsvps (user_id);
