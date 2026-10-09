-- The calendar record's `media` array (poster/header blobs with their aspect
-- ratio), kept verbatim like `locations` and `uris`.

SET search_path TO public, xata;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "media" jsonb;
