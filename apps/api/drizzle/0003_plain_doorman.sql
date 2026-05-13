CREATE INDEX "artist_albums_artist_id_idx" ON "artist_albums" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX "artist_tracks_artist_id_idx" ON "artist_tracks" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX "scrobbles_user_id_timestamp_idx" ON "scrobbles" USING btree ("user_id","timestamp");--> statement-breakpoint
CREATE INDEX "scrobbles_artist_id_idx" ON "scrobbles" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX "scrobbles_album_id_idx" ON "scrobbles" USING btree ("album_id");--> statement-breakpoint
CREATE INDEX "scrobbles_track_id_idx" ON "scrobbles" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "scrobbles_timestamp_idx" ON "scrobbles" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "tracks_genre_idx" ON "tracks" USING btree ("genre");--> statement-breakpoint
CREATE INDEX "user_artists_user_id_idx" ON "user_artists" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_artists_artist_id_idx" ON "user_artists" USING btree ("artist_id");