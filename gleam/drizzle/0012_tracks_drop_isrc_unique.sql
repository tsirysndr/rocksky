-- Roll back the ISRC unique constraint added in 0011. ISRC is no longer
-- enforced as unique — same ISRC can legitimately appear on more than one
-- tracks row (different albums sharing a single recording, etc.). Restore
-- the plain B-tree index so isrc lookups stay fast.
ALTER TABLE "tracks" DROP CONSTRAINT IF EXISTS "tracks_isrc_unique";
CREATE INDEX IF NOT EXISTS "tracks_isrc_idx" ON "tracks" USING btree ("isrc");
