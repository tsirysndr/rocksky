-- Rocksky appview schema, SQLite edition.
--
-- Table and column names are kept byte-identical to the Postgres schema in
-- apps/api/src/schema/*.ts — including the `xata_id` / `xata_createdat` /
-- `xata_updatedat` legacy names. That is deliberate: the SQL in the handlers
-- stays readable next to the TypeScript it was ported from, and moving an
-- existing Postgres deployment onto this binary is a data copy rather than a
-- rewrite.
--
-- Type mapping from Postgres:
--   text                  -> TEXT
--   integer / boolean     -> INTEGER   (booleans as 0/1)
--   real                  -> REAL
--   timestamp[tz]         -> TEXT, ISO-8601 UTC with milliseconds and a 'Z'
--                            suffix, which is what sqlx's chrono decoder for
--                            SQLite round-trips. CURRENT_TIMESTAMP is *not*
--                            used as a default: it emits 'YYYY-MM-DD HH:MM:SS'
--                            which that decoder rejects.
--   text[]                -> TEXT holding a JSON array (queried with json_each)
--   jsonb                 -> TEXT holding a JSON object
--
-- `xata_id` has no default here; ids are minted in Rust as `rec_<xid>`, the
-- same shape the xata_id() Postgres extension produces (crates/xataid-extension).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  xata_id         TEXT PRIMARY KEY,
  did             TEXT NOT NULL UNIQUE,
  display_name    TEXT,
  handle          TEXT NOT NULL UNIQUE,
  avatar          TEXT NOT NULL,
  is_bot          INTEGER NOT NULL DEFAULT 0,
  bot_flagged_at  TEXT,
  bot_reason      TEXT,
  xata_createdat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_updatedat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_version    INTEGER
);

CREATE TABLE IF NOT EXISTS artists (
  xata_id           TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  biography         TEXT,
  born              TEXT,
  born_in           TEXT,
  died              TEXT,
  picture           TEXT,
  sha256            TEXT NOT NULL UNIQUE,
  uri               TEXT UNIQUE,
  apple_music_link  TEXT,
  spotify_link      TEXT,
  tidal_link        TEXT,
  youtube_link      TEXT,
  -- Postgres text[]; a JSON array here.
  genres            TEXT,
  xata_createdat    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_updatedat    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_version      INTEGER
);
CREATE INDEX IF NOT EXISTS artists_name_idx ON artists (name);

CREATE TABLE IF NOT EXISTS albums (
  xata_id           TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  artist            TEXT NOT NULL,
  release_date      TEXT,
  year              INTEGER,
  album_art         TEXT,
  uri               TEXT UNIQUE,
  artist_uri        TEXT,
  apple_music_link  TEXT UNIQUE,
  spotify_link      TEXT UNIQUE,
  tidal_link        TEXT UNIQUE,
  youtube_link      TEXT UNIQUE,
  sha256            TEXT NOT NULL UNIQUE,
  xata_createdat    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_updatedat    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_version      INTEGER
);
CREATE INDEX IF NOT EXISTS albums_title_idx ON albums (title);
CREATE INDEX IF NOT EXISTS albums_artist_idx ON albums (artist);

CREATE TABLE IF NOT EXISTS tracks (
  xata_id            TEXT PRIMARY KEY,
  title              TEXT NOT NULL,
  artist             TEXT NOT NULL,
  album_artist       TEXT NOT NULL,
  album_art          TEXT,
  album              TEXT NOT NULL,
  track_number       INTEGER,
  duration           INTEGER NOT NULL,
  mb_id              TEXT,
  isrc               TEXT,
  youtube_link       TEXT UNIQUE,
  spotify_link       TEXT UNIQUE,
  apple_music_link   TEXT UNIQUE,
  tidal_link         TEXT UNIQUE,
  sha256             TEXT NOT NULL UNIQUE,
  disc_number        INTEGER,
  lyrics             TEXT,
  composer           TEXT,
  genre              TEXT,
  label              TEXT,
  copyright_message  TEXT,
  key                TEXT,
  bpm                REAL,
  uri                TEXT UNIQUE,
  album_uri          TEXT,
  artist_uri         TEXT,
  xata_createdat     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_updatedat     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_version       INTEGER
);
CREATE INDEX IF NOT EXISTS tracks_genre_idx ON tracks (genre);
CREATE INDEX IF NOT EXISTS tracks_artist_uri_idx ON tracks (artist_uri);
CREATE INDEX IF NOT EXISTS tracks_album_idx ON tracks (album);
CREATE INDEX IF NOT EXISTS tracks_album_artist_idx ON tracks (album_artist);
CREATE INDEX IF NOT EXISTS tracks_isrc_idx ON tracks (isrc);
CREATE INDEX IF NOT EXISTS tracks_mb_id_idx ON tracks (mb_id);
CREATE INDEX IF NOT EXISTS tracks_title_idx ON tracks (title);

CREATE TABLE IF NOT EXISTS scrobbles (
  xata_id         TEXT PRIMARY KEY,
  user_id         TEXT REFERENCES users (xata_id),
  track_id        TEXT REFERENCES tracks (xata_id),
  album_id        TEXT REFERENCES albums (xata_id),
  artist_id       TEXT REFERENCES artists (xata_id),
  uri             TEXT UNIQUE,
  xata_createdat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_updatedat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_version    INTEGER,
  timestamp       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT scrobbles_user_track_timestamp_unique UNIQUE (user_id, track_id, timestamp)
);
CREATE INDEX IF NOT EXISTS scrobbles_user_id_timestamp_idx ON scrobbles (user_id, timestamp);
CREATE INDEX IF NOT EXISTS scrobbles_artist_id_idx ON scrobbles (artist_id);
CREATE INDEX IF NOT EXISTS scrobbles_album_id_idx ON scrobbles (album_id);
CREATE INDEX IF NOT EXISTS scrobbles_track_id_idx ON scrobbles (track_id);
CREATE INDEX IF NOT EXISTS scrobbles_timestamp_idx ON scrobbles (timestamp);

-- Catalogue junction tables. The UNIQUE constraints matter: library reads
-- dedupe on these axes, and duplicate rows here fan out into duplicated
-- results (see the note in apps/api/src/schema/0023_junction_tables_unique).
CREATE TABLE IF NOT EXISTS album_tracks (
  xata_id         TEXT PRIMARY KEY,
  album_id        TEXT NOT NULL REFERENCES albums (xata_id),
  track_id        TEXT NOT NULL REFERENCES tracks (xata_id),
  xata_createdat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_updatedat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_version    INTEGER,
  CONSTRAINT album_tracks_album_id_track_id_unique UNIQUE (album_id, track_id)
);
CREATE INDEX IF NOT EXISTS album_tracks_album_id_idx ON album_tracks (album_id);
CREATE INDEX IF NOT EXISTS album_tracks_track_id_idx ON album_tracks (track_id);

CREATE TABLE IF NOT EXISTS artist_albums (
  xata_id         TEXT PRIMARY KEY,
  artist_id       TEXT NOT NULL REFERENCES artists (xata_id),
  album_id        TEXT NOT NULL REFERENCES albums (xata_id),
  xata_createdat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_updatedat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_version    INTEGER,
  CONSTRAINT artist_albums_artist_id_album_id_unique UNIQUE (artist_id, album_id)
);
CREATE INDEX IF NOT EXISTS artist_albums_artist_id_idx ON artist_albums (artist_id);
CREATE INDEX IF NOT EXISTS artist_albums_album_id_idx ON artist_albums (album_id);

CREATE TABLE IF NOT EXISTS artist_tracks (
  xata_id         TEXT PRIMARY KEY,
  artist_id       TEXT NOT NULL REFERENCES artists (xata_id),
  track_id        TEXT NOT NULL REFERENCES tracks (xata_id),
  xata_createdat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_updatedat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_version    INTEGER,
  CONSTRAINT artist_tracks_artist_id_track_id_unique UNIQUE (artist_id, track_id)
);
CREATE INDEX IF NOT EXISTS artist_tracks_artist_id_idx ON artist_tracks (artist_id);
CREATE INDEX IF NOT EXISTS artist_tracks_track_id_idx ON artist_tracks (track_id);

-- Per-user play counters, one row per (user, entity).
CREATE TABLE IF NOT EXISTS user_albums (
  xata_id         TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users (xata_id),
  album_id        TEXT NOT NULL REFERENCES albums (xata_id),
  xata_createdat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_updatedat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_version    INTEGER,
  scrobbles       INTEGER,
  uri             TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS user_albums_user_id_idx ON user_albums (user_id);
CREATE INDEX IF NOT EXISTS user_albums_album_id_idx ON user_albums (album_id);

CREATE TABLE IF NOT EXISTS user_artists (
  xata_id         TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users (xata_id),
  artist_id       TEXT NOT NULL REFERENCES artists (xata_id),
  xata_createdat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_updatedat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_version    INTEGER,
  scrobbles       INTEGER,
  uri             TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS user_artists_user_id_idx ON user_artists (user_id);
CREATE INDEX IF NOT EXISTS user_artists_artist_id_idx ON user_artists (artist_id);

CREATE TABLE IF NOT EXISTS user_tracks (
  xata_id         TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users (xata_id),
  track_id        TEXT NOT NULL REFERENCES tracks (xata_id),
  xata_createdat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_updatedat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_version    INTEGER,
  uri             TEXT NOT NULL UNIQUE,
  scrobbles       INTEGER
);
CREATE INDEX IF NOT EXISTS user_tracks_user_id_idx ON user_tracks (user_id);
CREATE INDEX IF NOT EXISTS user_tracks_track_id_idx ON user_tracks (track_id);

CREATE TABLE IF NOT EXISTS loved_tracks (
  xata_id         TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users (xata_id),
  track_id        TEXT NOT NULL REFERENCES tracks (xata_id),
  uri             TEXT UNIQUE,
  xata_createdat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS loved_tracks_track_id_idx ON loved_tracks (track_id);
CREATE INDEX IF NOT EXISTS loved_tracks_user_id_idx ON loved_tracks (user_id);

CREATE TABLE IF NOT EXISTS follows (
  xata_id         TEXT PRIMARY KEY,
  uri             TEXT NOT NULL UNIQUE,
  follower_did    TEXT NOT NULL,
  subject_did     TEXT NOT NULL,
  xata_version    INTEGER,
  xata_createdat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_updatedat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS follows_follower_subject_unique
  ON follows (follower_did, subject_did);
CREATE INDEX IF NOT EXISTS follows_subject_did_idx ON follows (subject_did);

CREATE TABLE IF NOT EXISTS feeds (
  xata_id         TEXT PRIMARY KEY,
  display_name    TEXT NOT NULL,
  description     TEXT,
  did             TEXT NOT NULL,
  uri             TEXT NOT NULL UNIQUE,
  avatar          TEXT,
  user_id         TEXT NOT NULL REFERENCES users (xata_id),
  xata_version    INTEGER,
  xata_createdat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_updatedat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS playlists (
  xata_id           TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  picture           TEXT,
  description       TEXT,
  uri               TEXT UNIQUE,
  cid               TEXT,
  -- Postgres text[]; a JSON array here. Reserved, nothing reads it yet.
  collaborators     TEXT,
  spotify_link      TEXT,
  tidal_link        TEXT,
  apple_music_link  TEXT,
  created_by        TEXT NOT NULL REFERENCES users (xata_id),
  xata_createdat    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_updatedat    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS playlists_created_by_idx ON playlists (created_by);

CREATE TABLE IF NOT EXISTS playlist_tracks (
  xata_id         TEXT PRIMARY KEY,
  playlist_id     TEXT NOT NULL REFERENCES playlists (xata_id),
  track_id        TEXT NOT NULL REFERENCES tracks (xata_id),
  uri             TEXT UNIQUE,
  cid             TEXT,
  added_by        TEXT REFERENCES users (xata_id),
  added_at        TEXT,
  xata_createdat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS playlist_tracks_playlist_id_added_at_idx
  ON playlist_tracks (playlist_id, added_at);

CREATE TABLE IF NOT EXISTS user_playlists (
  xata_id         TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users (xata_id),
  playlist_id     TEXT NOT NULL REFERENCES playlists (xata_id),
  xata_createdat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  uri             TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS user_playlists_user_id_idx ON user_playlists (user_id);

CREATE TABLE IF NOT EXISTS navidrome_playlists (
  xata_id         TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  uri             TEXT UNIQUE,
  user_id         TEXT NOT NULL REFERENCES users (xata_id),
  xata_createdat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_updatedat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS navidrome_playlists_user_id_idx ON navidrome_playlists (user_id);

CREATE TABLE IF NOT EXISTS navidrome_playlist_tracks (
  xata_id         TEXT PRIMARY KEY,
  playlist_id     TEXT NOT NULL REFERENCES navidrome_playlists (xata_id),
  track_id        TEXT NOT NULL REFERENCES tracks (xata_id),
  xata_createdat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS navidrome_playlist_tracks_playlist_id_idx
  ON navidrome_playlist_tracks (playlist_id);

CREATE TABLE IF NOT EXISTS shouts (
  xata_id          TEXT PRIMARY KEY,
  content          TEXT NOT NULL,
  track_id         TEXT REFERENCES tracks (xata_id),
  -- Mirrors the Postgres schema, which points artist_id at users(xata_id).
  artist_id        TEXT,
  album_id         TEXT REFERENCES albums (xata_id),
  scrobble_id      TEXT REFERENCES scrobbles (xata_id),
  uri              TEXT NOT NULL UNIQUE,
  author_id        TEXT NOT NULL REFERENCES users (xata_id),
  parent_id        TEXT REFERENCES shouts (xata_id),
  gif_url          TEXT,
  gif_preview_url  TEXT,
  gif_alt          TEXT,
  gif_width        INTEGER,
  gif_height       INTEGER,
  -- Postgres jsonb; a JSON array of mention facets here.
  facets           TEXT,
  xata_createdat   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_updatedat   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS shouts_track_id_idx ON shouts (track_id);
CREATE INDEX IF NOT EXISTS shouts_album_id_idx ON shouts (album_id);
CREATE INDEX IF NOT EXISTS shouts_artist_id_idx ON shouts (artist_id);
CREATE INDEX IF NOT EXISTS shouts_parent_id_idx ON shouts (parent_id);
CREATE INDEX IF NOT EXISTS shouts_author_id_idx ON shouts (author_id);

CREATE TABLE IF NOT EXISTS shout_likes (
  xata_id         TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users (xata_id),
  shout_id        TEXT NOT NULL REFERENCES shouts (xata_id),
  xata_createdat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  uri             TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS shout_likes_shout_id_idx ON shout_likes (shout_id);

CREATE TABLE IF NOT EXISTS shout_reports (
  xata_id         TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users (xata_id),
  shout_id        TEXT NOT NULL REFERENCES shouts (xata_id),
  xata_createdat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS profile_shouts (
  xata_id         TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users (xata_id),
  shout_id        TEXT NOT NULL REFERENCES shouts (xata_id),
  xata_createdat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS profile_shouts_user_id_idx ON profile_shouts (user_id);

-- One row per event. `type` is one of like_scrobble, follow, comment_scrobble,
-- comment_profile, reply, react_comment, mention. `user_id` is the recipient,
-- `actor_id` whoever triggered it.
CREATE TABLE IF NOT EXISTS notifications (
  xata_id         TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users (xata_id),
  actor_id        TEXT NOT NULL REFERENCES users (xata_id),
  type            TEXT NOT NULL,
  shout_id        TEXT REFERENCES shouts (xata_id),
  subject_uri     TEXT,
  read            INTEGER NOT NULL DEFAULT 0,
  read_at         TEXT,
  xata_createdat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS notifications_user_id_read_idx ON notifications (user_id, read);
CREATE INDEX IF NOT EXISTS notifications_user_id_createdat_idx
  ON notifications (user_id, xata_createdat);

CREATE TABLE IF NOT EXISTS api_keys (
  xata_id         TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  api_key         TEXT NOT NULL,
  shared_secret   TEXT NOT NULL,
  description     TEXT,
  enabled         INTEGER NOT NULL DEFAULT 1,
  user_id         TEXT NOT NULL REFERENCES users (xata_id),
  xata_createdat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_updatedat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS api_keys_user_id_idx ON api_keys (user_id);
CREATE INDEX IF NOT EXISTS api_keys_api_key_idx ON api_keys (api_key);

-- Long-lived bearer tokens. A missing row means revoked: verifyToken checks
-- `jti` against this table on every request (see src/auth/jwt.rs).
CREATE TABLE IF NOT EXISTS access_tokens (
  xata_id          TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users (xata_id),
  name             TEXT NOT NULL,
  jti              TEXT NOT NULL UNIQUE,
  token_encrypted  TEXT NOT NULL,
  last_four        TEXT NOT NULL,
  last_used_at     TEXT,
  xata_createdat   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_updatedat   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS access_tokens_user_id_idx ON access_tokens (user_id);

CREATE TABLE IF NOT EXISTS webscrobblers (
  xata_id         TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  uuid            TEXT NOT NULL,
  description     TEXT,
  enabled         INTEGER NOT NULL DEFAULT 1,
  user_id         TEXT NOT NULL REFERENCES users (xata_id),
  xata_createdat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_updatedat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS webscrobblers_user_id_idx ON webscrobblers (user_id);

CREATE TABLE IF NOT EXISTS mirror_sources (
  xata_id               TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users (xata_id),
  provider              TEXT NOT NULL,
  enabled               INTEGER NOT NULL DEFAULT 0,
  -- NULL means "never set", which the API reports as enabled.
  push_enabled          INTEGER,
  external_username     TEXT,
  encrypted_api_key     TEXT,
  last_polled_at        TEXT,
  last_scrobble_seen_at TEXT,
  xata_createdat        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_updatedat        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_version          INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS mirror_sources_user_provider_idx
  ON mirror_sources (user_id, provider);
CREATE INDEX IF NOT EXISTS mirror_sources_enabled_provider_idx
  ON mirror_sources (enabled, provider);

CREATE TABLE IF NOT EXISTS import_jobs (
  xata_id         TEXT PRIMARY KEY,
  user_id         TEXT REFERENCES users (xata_id),
  type            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  total           INTEGER DEFAULT 0,
  processed       INTEGER DEFAULT 0,
  failed          INTEGER DEFAULT 0,
  errors          TEXT,
  xata_createdat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_updatedat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_version    INTEGER
);
CREATE INDEX IF NOT EXISTS import_jobs_user_id_idx ON import_jobs (user_id);
CREATE INDEX IF NOT EXISTS import_jobs_status_idx ON import_jobs (status);

CREATE TABLE IF NOT EXISTS queue_tracks (
  xata_id         TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users (xata_id),
  track_id        TEXT NOT NULL REFERENCES tracks (xata_id),
  position        INTEGER NOT NULL,
  file_uri        TEXT NOT NULL,
  xata_version    INTEGER NOT NULL DEFAULT 0,
  xata_createdat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_updatedat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS queue_tracks_user_id_position_idx ON queue_tracks (user_id, position);

CREATE TABLE IF NOT EXISTS user_storage_providers (
  xata_id         TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users (xata_id),
  label           TEXT NOT NULL,
  endpoint        TEXT NOT NULL,
  region          TEXT NOT NULL DEFAULT 'auto',
  bucket          TEXT NOT NULL,
  access_key      TEXT NOT NULL,
  secret_key      TEXT NOT NULL,
  public_url      TEXT,
  verified_at     TEXT,
  xata_createdat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_updatedat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_version    INTEGER
);
CREATE INDEX IF NOT EXISTS user_storage_providers_user_id_idx
  ON user_storage_providers (user_id);

-- `storage_provider_id IS NULL` means managed storage. That path must keep
-- working untouched; BYO storage is purely additive.
CREATE TABLE IF NOT EXISTS user_uploads (
  xata_id              TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL REFERENCES users (xata_id),
  track_id             TEXT NOT NULL REFERENCES tracks (xata_id),
  r2_key               TEXT NOT NULL,
  mime_type            TEXT NOT NULL,
  file_size            INTEGER NOT NULL,
  original_filename    TEXT NOT NULL,
  sample_rate          INTEGER,
  storage_provider_id  TEXT REFERENCES user_storage_providers (xata_id),
  uploaded_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_createdat       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_updatedat       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_version         INTEGER
);
CREATE INDEX IF NOT EXISTS user_uploads_user_id_idx ON user_uploads (user_id);
CREATE INDEX IF NOT EXISTS user_uploads_track_id_idx ON user_uploads (track_id);
CREATE INDEX IF NOT EXISTS user_uploads_user_id_track_id_idx ON user_uploads (user_id, track_id);

CREATE TABLE IF NOT EXISTS upload_queue_state (
  xata_id         TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL UNIQUE REFERENCES users (xata_id),
  upload_ids      TEXT NOT NULL DEFAULT '[]',
  current_index   INTEGER NOT NULL DEFAULT 0,
  xata_createdat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_updatedat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_version    INTEGER
);

CREATE TABLE IF NOT EXISTS spotify_apps (
  xata_id          TEXT PRIMARY KEY,
  xata_version     INTEGER,
  spotify_app_id   TEXT NOT NULL UNIQUE,
  spotify_secret   TEXT NOT NULL,
  xata_createdat   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_updatedat   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS spotify_accounts (
  xata_id         TEXT PRIMARY KEY,
  xata_version    INTEGER,
  email           TEXT NOT NULL,
  user_id         TEXT NOT NULL REFERENCES users (xata_id),
  is_beta_user    INTEGER NOT NULL DEFAULT 0,
  spotify_app_id  TEXT,
  xata_createdat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_updatedat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS spotify_accounts_user_id_idx ON spotify_accounts (user_id);

CREATE TABLE IF NOT EXISTS spotify_tokens (
  xata_id         TEXT PRIMARY KEY,
  xata_version    INTEGER,
  access_token    TEXT NOT NULL,
  refresh_token   TEXT NOT NULL,
  user_id         TEXT NOT NULL REFERENCES users (xata_id),
  spotify_app_id  TEXT NOT NULL,
  xata_createdat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  xata_updatedat  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS spotify_tokens_user_id_idx ON spotify_tokens (user_id);

-- Postgres has these two as MATERIALIZED VIEWs (drizzle/0024, drizzle/0026)
-- refreshed by a cron in apps/api/src/server.ts. Here they are ordinary views:
-- always consistent, no refresh job, and nothing to go stale. The reason
-- Postgres needed them materialized was scale on the hosted instance (a 1.5M
-- row scrobbles scan per request); a self-hosted library aggregates fast enough
-- live, and the supporting indexes on scrobbles are in place either way.
--
-- The names and columns are identical to the Postgres views, so handler SQL
-- reads the same against either backend.
CREATE VIEW IF NOT EXISTS user_artists_mv AS
SELECT
  s.user_id      AS user_id,
  s.artist_id    AS artist_id,
  count(*)       AS play_count
FROM scrobbles s
JOIN artists a ON a.xata_id = s.artist_id
-- SQLite's LIKE is already case-insensitive for ASCII, so this is the ILIKE.
WHERE a.name NOT LIKE 'Various Artists'
GROUP BY s.user_id, s.artist_id;

CREATE VIEW IF NOT EXISTS top_scrobblers_mv AS
SELECT
  s.user_id                        AS user_id,
  count(*)                         AS scrobbles,
  count(DISTINCT s.artist_id)      AS unique_artists,
  count(DISTINCT s.track_id)       AS unique_tracks
FROM scrobbles s
WHERE s.user_id IS NOT NULL
GROUP BY s.user_id;
