-- Music events. A row is a community.lexicon.calendar.event record merged with
-- the app.rocksky.event.music record that marks it as a music event and names
-- the lineup; calendar events without that annotation are never indexed. Rows
-- are only ever written by jetstream (crates/jetstream/src/event.rs), from
-- repos listed in EVENT_PUBLISHER_DIDS.
--
-- Same search_path reasoning as 0040.

SET search_path TO public, xata;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "events" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id() NOT NULL,
	"uri" text NOT NULL,
	"cid" text,
	"music_uri" text NOT NULL,
	"music_cid" text,
	"name" text NOT NULL,
	"description" text,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"mode" text,
	"status" text,
	"locations" jsonb,
	"uris" jsonb,
	"kind" text,
	"genre" text,
	"tags" text[],
	"external_ids" jsonb,
	"tickets_url" text,
	"image_url" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	"xata_version" integer,
	CONSTRAINT "events_uri_unique" UNIQUE("uri"),
	CONSTRAINT "events_music_uri_unique" UNIQUE("music_uri")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_artists" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id() NOT NULL,
	"event_id" text NOT NULL,
	"artist_id" text NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"stage" text,
	"mbid" text,
	"starts_at" timestamp with time zone,
	"position" integer DEFAULT 0 NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_rsvps" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id() NOT NULL,
	"event_id" text NOT NULL,
	"user_id" text NOT NULL,
	"uri" text NOT NULL,
	"cid" text,
	"status" text NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "event_rsvps_uri_unique" UNIQUE("uri")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "events" ADD CONSTRAINT "events_created_by_users_xata_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "event_artists" ADD CONSTRAINT "event_artists_event_id_events_xata_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("xata_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "event_artists" ADD CONSTRAINT "event_artists_artist_id_artists_xata_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("xata_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_event_id_events_xata_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("xata_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_user_id_users_xata_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_starts_at_idx" ON "events" USING btree ("starts_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_created_by_idx" ON "events" USING btree ("created_by");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "event_artists_event_artist_idx" ON "event_artists" USING btree ("event_id","artist_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_artists_artist_id_idx" ON "event_artists" USING btree ("artist_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "event_rsvps_event_user_idx" ON "event_rsvps" USING btree ("event_id","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_rsvps_user_id_idx" ON "event_rsvps" USING btree ("user_id");
