-- OAuth state for the ATProto login flow, plus the DID document cache.
--
-- Deliberately a separate database from the appview projections: re-indexing
-- from Jetstream means wiping and rebuilding those tables, and that must never
-- log anyone out. Column names match the Kysely schema in apps/api/src/db.ts
-- (`auth_session` / `auth_state`) so an existing SQLite file can be reused.

CREATE TABLE IF NOT EXISTS auth_session (
  key         TEXT PRIMARY KEY,
  session     TEXT NOT NULL,
  -- The token set's expiry, lifted out of the JSON so sessions about to lapse
  -- can be found without parsing every row.
  expires_at  TEXT
);

CREATE TABLE IF NOT EXISTS auth_state (
  key    TEXT PRIMARY KEY,
  state  TEXT NOT NULL
);

-- Resolved DID documents and handle lookups. `expires_at` is when the entry
-- goes stale; the resolver treats a missing or expired row as a cache miss.
CREATE TABLE IF NOT EXISTS did_cache (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS did_cache_expires_at_idx ON did_cache (expires_at);
