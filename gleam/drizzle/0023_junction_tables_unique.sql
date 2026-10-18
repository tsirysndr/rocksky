-- The three catalogue junction tables had no unique constraint, and every
-- writer (api, jetstream, pgpull, cli) inserts them check-then-insert: SELECT
-- the pair, INSERT when absent. Four ingestion paths write concurrently, so two
-- transactions routinely both see "absent" and both insert. One (album, track)
-- pair had accumulated 469 rows.
--
-- Every read that joins through these tables then multiplies its rows: an album
-- page showed each song once per junction row, and SUM(duration) reported an
-- album as hours long. Collapse the duplicates (keep earliest by xata_createdat,
-- matching 0014) and enforce the pair, so the race short-circuits at the DB.
--
-- Nothing references these rows by xata_id — no foreign key points at any of the
-- three — so dropping the extras is safe.

-- album_tracks: 647 duplicated pairs, 20,969 extra rows.
WITH ranked AS (
  SELECT
    xata_id,
    FIRST_VALUE(xata_id) OVER (
      PARTITION BY album_id, track_id
      ORDER BY xata_createdat ASC, xata_id ASC
    ) AS keep_id
  FROM album_tracks
)
DELETE FROM album_tracks
WHERE xata_id IN (
  SELECT xata_id FROM ranked WHERE xata_id <> keep_id
);
--> statement-breakpoint

-- artist_tracks: 488 duplicated pairs, 8,164 extra rows.
WITH ranked AS (
  SELECT
    xata_id,
    FIRST_VALUE(xata_id) OVER (
      PARTITION BY artist_id, track_id
      ORDER BY xata_createdat ASC, xata_id ASC
    ) AS keep_id
  FROM artist_tracks
)
DELETE FROM artist_tracks
WHERE xata_id IN (
  SELECT xata_id FROM ranked WHERE xata_id <> keep_id
);
--> statement-breakpoint

-- artist_albums: 330 duplicated pairs, 33,929 extra rows (16% of the table).
WITH ranked AS (
  SELECT
    xata_id,
    FIRST_VALUE(xata_id) OVER (
      PARTITION BY artist_id, album_id
      ORDER BY xata_createdat ASC, xata_id ASC
    ) AS keep_id
  FROM artist_albums
)
DELETE FROM artist_albums
WHERE xata_id IN (
  SELECT xata_id FROM ranked WHERE xata_id <> keep_id
);
--> statement-breakpoint

ALTER TABLE "album_tracks"
  ADD CONSTRAINT "album_tracks_album_id_track_id_unique"
  UNIQUE ("album_id", "track_id");
--> statement-breakpoint

ALTER TABLE "artist_tracks"
  ADD CONSTRAINT "artist_tracks_artist_id_track_id_unique"
  UNIQUE ("artist_id", "track_id");
--> statement-breakpoint

ALTER TABLE "artist_albums"
  ADD CONSTRAINT "artist_albums_artist_id_album_id_unique"
  UNIQUE ("artist_id", "album_id");
