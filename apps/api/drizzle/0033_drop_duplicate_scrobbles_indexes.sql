-- `scrobbles` carried five pairs of byte-for-byte identical indexes, each pair
-- built twice under two naming conventions. A duplicate serves no read the
-- survivor cannot: the planner simply picks one of the two. What it does cost
-- is a second write on every insert, and 440MB of the table's 2.9GB.
--
--   dropped                         | kept                                  | size
--   --------------------------------+---------------------------------------+------
--   unique_scrobble_idx             | scrobbles_user_track_timestamp_unique | 203MB
--   idx_scrobbles_artist_timestamp  | scrobbles_artist_id_timestamp_idx     | 149MB
--   idx_scrobbles_track             | scrobbles_track_id_idx                |  38MB
--   idx_scrobbles_album             | scrobbles_album_id_idx                |  28MB
--   idx_scrobbles_artist            | scrobbles_artist_id_idx               |  22MB
--
-- Each survivor is the one declared in src/schema/scrobbles.ts, so the schema
-- and the database agree once this has run.
--
-- On uniqueness: `unique_scrobble_idx` is a bare unique index, whereas
-- `scrobbles_user_track_timestamp_unique` is the table constraint (0014, and
-- crates/db/migrations/0001_init.sql). Both enforce UNIQUE (user_id, track_id,
-- timestamp), so dropping the index leaves the guarantee fully intact and
-- leaves navidrome's `ON CONFLICT (user_id, track_id, timestamp)` an arbiter to
-- infer. The constraint cannot be the one dropped — that would take the
-- uniqueness with it.
--
-- Deliberately NOT dropped, despite looking redundant:
--   * idx_scrobbles_user (user_id) — a prefix of two wider indexes, but at 19MB
--     and 2.5M scans it is the cheapest way to answer a bare user_id lookup.
--   * unique_scrobble_track_idx (user_id, track_id, artist_id, timestamp) —
--     weaker as a constraint, but distinct in shape and serving 224k scans.
--
-- CONCURRENTLY because every scrobble writes this table; it cannot run inside a
-- transaction, hence the statements standing alone.

DROP INDEX CONCURRENTLY IF EXISTS "unique_scrobble_idx";

DROP INDEX CONCURRENTLY IF EXISTS "idx_scrobbles_artist_timestamp";

DROP INDEX CONCURRENTLY IF EXISTS "idx_scrobbles_track";

DROP INDEX CONCURRENTLY IF EXISTS "idx_scrobbles_album";

DROP INDEX CONCURRENTLY IF EXISTS "idx_scrobbles_artist";
