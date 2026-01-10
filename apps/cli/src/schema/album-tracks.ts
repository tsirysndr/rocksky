import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import albums from "./albums";
import tracks from "./tracks";

const albumTracks = sqliteTable(
  "album_tracks",
  {
    id: text("id").primaryKey().notNull(),
    albumId: text("album_id")
      .notNull()
      .references(() => albums.id),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },

  (t) => [unique("album_tracks_unique_index").on(t.albumId, t.trackId)],
);

export type SelectAlbumTrack = InferSelectModel<typeof albumTracks>;
export type InsertAlbumTrack = InferInsertModel<typeof albumTracks>;

export default albumTracks;
