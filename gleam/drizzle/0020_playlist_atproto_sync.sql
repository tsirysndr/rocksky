ALTER TABLE "playlist_tracks" ADD COLUMN IF NOT EXISTS "uri" text;--> statement-breakpoint
ALTER TABLE "playlist_tracks" ADD COLUMN IF NOT EXISTS "cid" text;--> statement-breakpoint
ALTER TABLE "playlist_tracks" ADD COLUMN IF NOT EXISTS "added_by" text;--> statement-breakpoint
ALTER TABLE "playlist_tracks" ADD COLUMN IF NOT EXISTS "added_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "cid" text;--> statement-breakpoint
ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "collaborators" text[];--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "playlist_tracks" ADD CONSTRAINT "playlist_tracks_added_by_users_xata_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "playlist_tracks_playlist_id_added_at_idx" ON "playlist_tracks" USING btree ("playlist_id","added_at");--> statement-breakpoint

-- The playlist ingest upserts the owner link with ON CONFLICT (user_id,
-- playlist_id). That index used to be created at startup by the Spotify
-- importer (crates/playlists), which no longer touches Postgres, so it belongs
-- with the rest of the schema.
CREATE UNIQUE INDEX IF NOT EXISTS "user_playlists_unique_index" ON "user_playlists" USING btree ("user_id","playlist_id");--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "playlist_tracks" ADD CONSTRAINT "playlist_tracks_uri_unique" UNIQUE("uri");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint

-- Playlists and their entries are only ever materialized from a jetstream
-- commit, so every row must carry the AT-URI of the record it mirrors. These
-- CHECKs are the structural version of that rule: no code path can insert a
-- playlist or a playlist entry that isn't backed by a record.
--
-- Added NOT VALID on purpose. Rows predating the AT-Proto sync (the old Spotify
-- importer wrote playlists straight to Postgres, and only got a uri back if the
-- putRecord succeeded) may have a NULL uri. NOT VALID enforces the constraint on
-- every insert and update from here on without rejecting that history. Run
-- `ALTER TABLE ... VALIDATE CONSTRAINT ...` once those rows have been backfilled
-- or removed.
DO $$ BEGIN
	ALTER TABLE "playlists" ADD CONSTRAINT "playlists_uri_not_null" CHECK ("uri" IS NOT NULL) NOT VALID;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "playlist_tracks" ADD CONSTRAINT "playlist_tracks_uri_not_null" CHECK ("uri" IS NOT NULL) NOT VALID;
EXCEPTION WHEN duplicate_object THEN null; END $$;
