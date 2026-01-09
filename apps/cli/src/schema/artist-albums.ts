import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import albums from "./albums";
import artists from "./artists";

const artistAlbums = sqliteTable("artist_albums", {
  id: text("id").primaryKey().notNull(),
  artistId: text("artist_id")
    .notNull()
    .references(() => artists.id),
  albumId: text("album_id")
    .notNull()
    .references(() => albums.id),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type SelectArtistAlbum = InferSelectModel<typeof artistAlbums>;
export type InsertArtistAlbum = InferInsertModel<typeof artistAlbums>;

export default artistAlbums;
