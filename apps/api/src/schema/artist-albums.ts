import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import albums from "./albums";
import artists from "./artists";

const artistAlbums = pgTable(
  "artist_albums",
  {
    id: text("xata_id").primaryKey().default(sql`xata_id()`),
    artistId: text("artist_id")
      .notNull()
      .references(() => artists.id),
    albumId: text("album_id")
      .notNull()
      .references(() => albums.id),
    createdAt: timestamp("xata_createdat").defaultNow().notNull(),
    updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
    xataVersion: integer("xata_version"),
  },
  (t) => [
    index("artist_albums_artist_id_idx").on(t.artistId),
    index("artist_albums_album_id_idx").on(t.albumId),
    unique("artist_albums_artist_id_album_id_unique").on(t.artistId, t.albumId),
  ],
);

export type SelectArtistAlbum = InferSelectModel<typeof artistAlbums>;
export type InsertArtistAlbum = InferInsertModel<typeof artistAlbums>;

export default artistAlbums;
