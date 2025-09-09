import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

const albums = pgTable("albums", {
  id: text("xata_id").primaryKey(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  releaseDate: text("release_date"),
  year: integer("year"),
  albumArt: text("album_art"),
  uri: text("uri").unique(),
  artistUri: text("artist_uri"),
  appleMusicLink: text("apple_music_link").unique(),
  spotifyLink: text("spotify_link").unique(),
  tidalLink: text("tidal_link").unique(),
  youtubeLink: text("youtube_link").unique(),
  sha256: text("sha256").unique().notNull(),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer("xata_version"),
});

export type SelectAlbum = InferSelectModel<typeof albums>;
export type InsertAlbum = InferInsertModel<typeof albums>;

export default albums;
