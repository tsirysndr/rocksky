-- Duplicate detection for events. `sha256` fingerprints the show (headliner,
-- day, venue); when a second record describes a show already indexed, by
-- fingerprint or by a shared external id, it is kept (it is record-backed)
-- but points at the first through `duplicate_of`. Readers list canonical rows
-- only and pool RSVPs across the group. Deleting the canonical event promotes
-- its duplicates back to canonical rows.

SET search_path TO public, xata;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "sha256" text;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "duplicate_of" text;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "events" ADD CONSTRAINT "events_duplicate_of_events_xata_id_fk" FOREIGN KEY ("duplicate_of") REFERENCES "public"."events"("xata_id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_sha256_idx" ON "events" USING btree ("sha256");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_duplicate_of_idx" ON "events" USING btree ("duplicate_of");
