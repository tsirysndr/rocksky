ALTER TABLE "user_playlists" DROP CONSTRAINT "user_playlists_playlist_id_tracks_xata_id_fk";
--> statement-breakpoint
ALTER TABLE "user_playlists" ADD CONSTRAINT "user_playlists_playlist_id_playlists_xata_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("xata_id") ON DELETE no action ON UPDATE no action;