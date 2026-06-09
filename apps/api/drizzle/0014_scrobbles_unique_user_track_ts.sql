-- Same (user_id, track_id, timestamp) was being inserted multiple times from
-- different ingestion sources (jetstream/navidrome/mirrors); each produced a
-- distinct at-uri so scrobbles_uri_unique didn't catch it. Backfill: collapse
-- existing duplicates (keep earliest by xata_createdat), then enforce a
-- composite unique so future races short-circuit at the DB.

-- Re-point shouts attached to a soon-to-be-deleted duplicate at the survivor.
WITH ranked AS (
  SELECT
    xata_id,
    user_id,
    track_id,
    "timestamp",
    FIRST_VALUE(xata_id) OVER (
      PARTITION BY user_id, track_id, "timestamp"
      ORDER BY xata_createdat ASC, xata_id ASC
    ) AS keep_id
  FROM scrobbles
  WHERE user_id IS NOT NULL AND track_id IS NOT NULL
)
UPDATE shouts s
SET scrobble_id = r.keep_id
FROM ranked r
WHERE s.scrobble_id = r.xata_id
  AND r.xata_id <> r.keep_id;
--> statement-breakpoint

-- Drop every duplicate row that isn't the survivor.
WITH ranked AS (
  SELECT
    xata_id,
    FIRST_VALUE(xata_id) OVER (
      PARTITION BY user_id, track_id, "timestamp"
      ORDER BY xata_createdat ASC, xata_id ASC
    ) AS keep_id
  FROM scrobbles
  WHERE user_id IS NOT NULL AND track_id IS NOT NULL
)
DELETE FROM scrobbles
WHERE xata_id IN (
  SELECT xata_id FROM ranked WHERE xata_id <> keep_id
);
--> statement-breakpoint

ALTER TABLE "scrobbles"
  ADD CONSTRAINT "scrobbles_user_track_timestamp_unique"
  UNIQUE ("user_id", "track_id", "timestamp");
