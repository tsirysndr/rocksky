-- Navidrome playlists are mirrored to the owner's PDS as app.rocksky.playlist
-- records. This column is the link between the local row and the record: it is
-- written once, after the record is published, and every later mutation
-- (rename, add/remove song, delete) is replayed against that AT-URI.
--
-- Nullable on purpose: playlists created before the mirror existed have no
-- record yet, and the mirror publishes one lazily on their first mutation.
ALTER TABLE "navidrome_playlists" ADD COLUMN IF NOT EXISTS "uri" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "navidrome_playlists_uri_unique" ON "navidrome_playlists" USING btree ("uri");
