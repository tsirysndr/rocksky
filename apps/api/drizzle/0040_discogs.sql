-- Discogs release metadata, filled asynchronously after a scrobble by the
-- artist+album lookup in lib/discogsEnrichment.ts. Everything here is a cache
-- of discogs.com, so the whole feature degrades to "no rows" and nothing in
-- the scrobble path depends on it.
--
-- The search_path below is load-bearing. In production the role is `xata`, so
-- an unqualified CREATE TABLE resolves to the `xata` schema (which is where
-- 0006 onwards accidentally put notifications, access_tokens, user_uploads and
-- the rest) rather than to `public`, where albums/tracks/users live. These
-- tables join albums, so they belong in `public` too. xata_id() stays
-- unqualified: it is in `public` on a local database and in `xata` on
-- production, and the path covers both.

SET search_path TO public, xata;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discogs_releases" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id() NOT NULL,
	"discogs_id" integer NOT NULL,
	"master_id" integer,
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"album_art" text,
	"year" integer,
	"original_year" integer,
	"release_date" text,
	"country" text,
	"label" text,
	"catalog_number" text,
	"barcode" text,
	"formats" text[],
	"genres" text[],
	"styles" text[],
	"discogs_url" text,
	"score" real,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	"xata_version" integer,
	CONSTRAINT "discogs_releases_discogs_id_unique" UNIQUE("discogs_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discogs_releases_master_id_idx" ON "discogs_releases" USING btree ("master_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discogs_releases_artist_title_idx" ON "discogs_releases" USING btree ("artist","title");
--> statement-breakpoint

-- One row per artist+album asked about, including misses (null release_id), so
-- a replayed album does not spend the 60-requests-per-minute token quota again.
CREATE TABLE IF NOT EXISTS "discogs_searches" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id() NOT NULL,
	"sha256" text NOT NULL,
	"artist" text NOT NULL,
	"album" text NOT NULL,
	"release_id" text,
	"score" real,
	"searched_at" timestamp DEFAULT now() NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	"xata_version" integer,
	CONSTRAINT "discogs_searches_sha256_unique" UNIQUE("sha256")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "discogs_searches" ADD CONSTRAINT "discogs_searches_release_id_discogs_releases_xata_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."discogs_releases"("xata_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discogs_searches_release_id_idx" ON "discogs_searches" USING btree ("release_id");
--> statement-breakpoint

-- Nullable, and only ever written when a lookup matched: every existing album
-- keeps working untouched.
ALTER TABLE "albums" ADD COLUMN IF NOT EXISTS "discogs_release_id" text;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "albums" ADD CONSTRAINT "albums_discogs_release_id_discogs_releases_xata_id_fk" FOREIGN KEY ("discogs_release_id") REFERENCES "public"."discogs_releases"("xata_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
