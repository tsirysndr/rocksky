-- Performance and production credits for a Discogs release (its extraartists,
-- plus the matched track's own): the part of Discogs that no other provider
-- gives us. One row per credit, rewritten wholesale when a release is
-- re-fetched.
--
-- Same search_path reasoning as 0040: unqualified names would resolve to the
-- `xata` schema in production, and these belong next to discogs_releases in
-- `public`.

SET search_path TO public, xata;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discogs_credits" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id() NOT NULL,
	"release_id" text NOT NULL,
	"artist_id" integer,
	"name" text NOT NULL,
	"role" text,
	"tracks" text,
	"position" integer NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	"xata_version" integer,
	CONSTRAINT "discogs_credits_release_id_position_unique" UNIQUE("release_id","position")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "discogs_credits" ADD CONSTRAINT "discogs_credits_release_id_discogs_releases_xata_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discogs_releases"("xata_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discogs_credits_release_id_idx" ON "discogs_credits" USING btree ("release_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discogs_credits_artist_id_idx" ON "discogs_credits" USING btree ("artist_id");
--> statement-breakpoint

-- Null means credits were never fetched, so a release stored before this
-- migration is re-asked once rather than looking like it has none.
ALTER TABLE "discogs_releases" ADD COLUMN IF NOT EXISTS "credits_fetched_at" timestamp;
