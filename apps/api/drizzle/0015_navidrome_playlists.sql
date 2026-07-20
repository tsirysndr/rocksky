CREATE TABLE "navidrome_playlists" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"user_id" text NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL,
	"xata_updatedat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "navidrome_playlist_tracks" (
	"xata_id" text PRIMARY KEY DEFAULT xata_id() NOT NULL,
	"playlist_id" text NOT NULL,
	"track_id" text NOT NULL,
	"xata_createdat" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "navidrome_playlists" ADD CONSTRAINT "navidrome_playlists_user_id_users_xata_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "navidrome_playlist_tracks" ADD CONSTRAINT "navidrome_playlist_tracks_playlist_id_navidrome_playlists_xata_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."navidrome_playlists"("xata_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "navidrome_playlist_tracks" ADD CONSTRAINT "navidrome_playlist_tracks_track_id_tracks_xata_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("xata_id") ON DELETE no action ON UPDATE no action;
