ALTER TABLE "tracks" ADD COLUMN IF NOT EXISTS "isrc" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tracks_isrc_idx" ON "tracks" USING btree ("isrc");
