ALTER TABLE "tracks" ADD COLUMN "lastfm_link" text;--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_lastfm_link_unique" UNIQUE("lastfm_link");