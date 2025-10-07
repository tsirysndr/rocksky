import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import albums from "./albums";
import artists from "./artists";

const artistAlbums = pgTable("artist_albums", {
  id: text("xata_id")
    .primaryKey()
    .default(sql`xata_id()`),
  artistId: text("artist_id")
    .notNull()
    .references(() => artists.id),
  albumId: text("album_id")
    .notNull()
    .references(() => albums.id),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer("xata_version"),
});

export type SelectArtistAlbum = InferSelectModel<typeof artistAlbums>;
export type InsertArtistAlbum = InferInsertModel<typeof artistAlbums>;

export default artistAlbums;
