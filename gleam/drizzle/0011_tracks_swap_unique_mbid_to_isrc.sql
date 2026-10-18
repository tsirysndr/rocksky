-- mb_id stops being the canonical recording identifier — MusicBrainz can
-- legitimately point multiple Rocksky track rows at the same recording id
-- (remasters, regional releases). The constraint was already dropped from
-- production by hand; this migration aligns dev / fresh deploys.
ALTER TABLE "tracks" DROP CONSTRAINT IF EXISTS "tracks_mb_id_unique";

-- The redundant standalone B-tree index gets replaced by the unique index
-- that ADD CONSTRAINT creates implicitly.
DROP INDEX IF EXISTS "tracks_isrc_idx";

-- ISRC is now the unique recording key. Will fail if duplicates exist —
-- run a one-off de-dupe in prod before applying.
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_isrc_unique" UNIQUE ("isrc");
