-- The AcoustID (Chromaprint) fingerprint of an uploaded track's first two
-- minutes, base64url as `fpcalc` prints it and as AcoustID's API accepts it.
--
-- It identifies the recording rather than the metadata: two uploads of the
-- same track fingerprint alike however their tags differ, which is what
-- matching on title/artist/album cannot do. Filled asynchronously after an
-- upload, alongside key and bpm (0025), so it is nullable and stays null for
-- every track that was never an upload.
--
-- No index: nothing looks a track up by fingerprint yet — matching compares
-- fingerprints by bit distance, which btree cannot answer anyway. Add one with
-- the query that needs it.

ALTER TABLE "tracks" ADD COLUMN IF NOT EXISTS "acoustid_fingerprint" text;
