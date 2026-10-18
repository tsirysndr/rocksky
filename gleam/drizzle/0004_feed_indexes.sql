CREATE INDEX IF NOT EXISTS "loved_tracks_track_id_idx" ON "loved_tracks" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tracks_artist_uri_idx" ON "tracks" USING btree ("artist_uri");
