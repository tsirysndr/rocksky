ALTER TABLE "tracks"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' ||
      coalesce(artist, '') || ' ' ||
      coalesce(album_artist, '') || ' ' ||
      coalesce(album, '') || ' ' ||
      coalesce(genre, '') || ' ' ||
      coalesce(composer, '')
    )
  ) STORED;
--> statement-breakpoint
CREATE INDEX "tracks_search_idx" ON "tracks" USING GIN ("search_vector");
