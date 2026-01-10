import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const albums = sqliteTable("albums", {
  id: text("id").primaryKey().notNull(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  releaseDate: text("release_date"),
  year: integer("year"),
  albumArt: text("album_art"),
  uri: text("uri").unique(),
  cid: text("cid").unique().notNull(),
  artistUri: text("artist_uri"),
  appleMusicLink: text("apple_music_link").unique(),
  spotifyLink: text("spotify_link").unique(),
  tidalLink: text("tidal_link").unique(),
  youtubeLink: text("youtube_link").unique(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type SelectAlbum = InferSelectModel<typeof albums>;
export type InsertAlbum = InferInsertModel<typeof albums>;

export default albums;
