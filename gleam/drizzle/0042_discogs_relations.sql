-- The relational half of a Discogs release: its tracklist, every credited
-- artist, every label and company, every printed identifier, and the master
-- that groups its editions. discogs_releases keeps the single "primary" label,
-- catalog number and barcode for convenience; these tables hold the full set,
-- which is what a release with four labels and six identifiers actually has.
--
-- Child rows are rewritten wholesale per release, so `position` / `idx` is
-- just the order Discogs listed them in.
--
-- Same search_path reasoning as 0040.

SET search_path TO public, xata;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discogs_masters" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id() NOT NULL,
	"discogs_id" integer NOT NULL,
	"title" text NOT NULL,
	"artist" text,
	"year" integer,
	"main_release_id" integer,
	"discogs_url" text,
	"genres" text[],
	"styles" text[],
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	"xata_version" integer,
	CONSTRAINT "discogs_masters_discogs_id_unique" UNIQUE("discogs_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discogs_release_artists" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id() NOT NULL,
	"release_id" text NOT NULL,
	"artist_id" integer,
	"name" text NOT NULL,
	"anv" text,
	"join_phrase" text,
	"role" text,
	"position" integer NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	"xata_version" integer,
	CONSTRAINT "discogs_release_artists_release_id_position_unique" UNIQUE("release_id","position")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "discogs_release_artists" ADD CONSTRAINT "discogs_release_artists_release_id_discogs_releases_xata_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discogs_releases"("xata_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discogs_release_artists_release_id_idx" ON "discogs_release_artists" USING btree ("release_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discogs_release_artists_artist_id_idx" ON "discogs_release_artists" USING btree ("artist_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discogs_release_labels" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id() NOT NULL,
	"release_id" text NOT NULL,
	"label_id" integer,
	"name" text NOT NULL,
	"catalog_number" text,
	"kind" text NOT NULL,
	"entity_type" text,
	"position" integer NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	"xata_version" integer,
	CONSTRAINT "discogs_release_labels_release_id_kind_position_unique" UNIQUE("release_id","kind","position")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "discogs_release_labels" ADD CONSTRAINT "discogs_release_labels_release_id_discogs_releases_xata_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discogs_releases"("xata_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discogs_release_labels_release_id_idx" ON "discogs_release_labels" USING btree ("release_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discogs_release_labels_label_id_idx" ON "discogs_release_labels" USING btree ("label_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discogs_identifiers" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id() NOT NULL,
	"release_id" text NOT NULL,
	"type" text NOT NULL,
	"value" text,
	"description" text,
	"position" integer NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	"xata_version" integer,
	CONSTRAINT "discogs_identifiers_release_id_position_unique" UNIQUE("release_id","position")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "discogs_identifiers" ADD CONSTRAINT "discogs_identifiers_release_id_discogs_releases_xata_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discogs_releases"("xata_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discogs_identifiers_release_id_idx" ON "discogs_identifiers" USING btree ("release_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discogs_identifiers_type_value_idx" ON "discogs_identifiers" USING btree ("type","value");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discogs_tracks" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id() NOT NULL,
	"release_id" text NOT NULL,
	"position" text,
	"type" text,
	"title" text NOT NULL,
	"duration" text,
	"duration_ms" integer,
	"disc_number" integer,
	"track_number" integer,
	"idx" integer NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	"xata_version" integer,
	CONSTRAINT "discogs_tracks_release_id_idx_unique" UNIQUE("release_id","idx")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "discogs_tracks" ADD CONSTRAINT "discogs_tracks_release_id_discogs_releases_xata_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discogs_releases"("xata_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discogs_tracks_release_id_idx" ON "discogs_tracks" USING btree ("release_id");
--> statement-breakpoint
-- Lets a release be joined to its master without a second column.
CREATE INDEX IF NOT EXISTS "discogs_releases_master_id_lookup_idx" ON "discogs_releases" USING btree ("master_id");
