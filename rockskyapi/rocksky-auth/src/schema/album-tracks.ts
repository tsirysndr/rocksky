import { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { pgTable, text } from "drizzle-orm/pg-core";
import albums from "./albums";
import tracks from "./tracks";

const albumTracks = pgTable("album_tracks", {
  id: text("xata_id").primaryKey(),
  albumId: text("album_id")
    .notNull()
    .references(() => albums.id),
  trackId: text("track_id")
    .notNull()
    .references(() => tracks.id),
});

export type SelectAlbumTrack = InferSelectModel<typeof albumTracks>;
export type InsertAlbumTrack = InferInsertModel<typeof albumTracks>;

export default albumTracks;
