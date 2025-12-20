ALTER TABLE "albums" ADD COLUMN "tidal_id" integer;--> statement-breakpoint
ALTER TABLE "albums" ADD COLUMN "spotify_id" text;--> statement-breakpoint
ALTER TABLE "artists" ADD COLUMN "tidal_id" integer;--> statement-breakpoint
ALTER TABLE "artists" ADD COLUMN "spotify_id" text;--> statement-breakpoint
ALTER TABLE "artists" ADD COLUMN "roles" text[];--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN "tidal_id" integer;--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN "spotify_id" text;--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN "isrc" text;--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_tidal_id_unique" UNIQUE("tidal_id");--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_spotify_id_unique" UNIQUE("spotify_id");--> statement-breakpoint
ALTER TABLE "artists" ADD CONSTRAINT "artists_tidal_id_unique" UNIQUE("tidal_id");--> statement-breakpoint
ALTER TABLE "artists" ADD CONSTRAINT "artists_spotify_id_unique" UNIQUE("spotify_id");--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_tidal_id_unique" UNIQUE("tidal_id");--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_spotify_id_unique" UNIQUE("spotify_id");--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_isrc_unique" UNIQUE("isrc");