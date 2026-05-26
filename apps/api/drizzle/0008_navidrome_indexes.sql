-- album_tracks: both FK columns were completely unindexed
CREATE INDEX "album_tracks_album_id_idx" ON "album_tracks" USING btree ("album_id");--> statement-breakpoint
CREATE INDEX "album_tracks_track_id_idx" ON "album_tracks" USING btree ("track_id");--> statement-breakpoint

-- artist_tracks: track_id lookup missing (artist_id already indexed)
CREATE INDEX "artist_tracks_track_id_idx" ON "artist_tracks" USING btree ("track_id");--> statement-breakpoint

-- artist_albums: album_id lookup missing (artist_id already indexed)
CREATE INDEX "artist_albums_album_id_idx" ON "artist_albums" USING btree ("album_id");--> statement-breakpoint

-- tracks: album + album_artist needed for the consistency JOIN added to all album queries
CREATE INDEX "tracks_album_idx" ON "tracks" USING btree ("album");--> statement-breakpoint
CREATE INDEX "tracks_album_artist_idx" ON "tracks" USING btree ("album_artist");--> statement-breakpoint

-- user_uploads: composite covering index for the dominant access pattern (filter by user, join on track)
CREATE INDEX "user_uploads_user_id_track_id_idx" ON "user_uploads" USING btree ("user_id", "track_id");--> statement-breakpoint

-- artists: LIKE with leading wildcard requires trigram GIN, btree is useless here
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "artists_name_trgm_idx" ON "artists" USING gin (lower("name") gin_trgm_ops);--> statement-breakpoint

-- albums: same for album title search
CREATE INDEX "albums_title_trgm_idx" ON "albums" USING gin (lower("title") gin_trgm_ops);
