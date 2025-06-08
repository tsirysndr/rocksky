import { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

const tracks = pgTable("tracks", {
  id: text("xata_id").primaryKey(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  albumArtist: text("album_artist").notNull(),
  albumArt: text("album_art"),
  album: text("album").notNull(),
  trackNumber: text("track_number"),
  duration: integer("duration").notNull(),
  mbId: text("mb_id").unique(),
  youtubeLink: text("youtube_link").unique(),
  spotifyLink: text("spotify_link").unique(),
  appleMusicLink: text("apple_music_link").unique(),
  tidalLink: text("tidal_link").unique(),
  sha256: text("sha256").unique().notNull(),
  discNumber: integer("disc_number"),
  lyrics: text("lyrics"),
  composer: text("composer"),
  genre: text("genre"),
  label: text("label"),
  copyrightMessage: text("copyright_message"),
  uri: text("uri").unique(),
  albumUri: text("album_uri").unique(),
  artistUri: text("artist_uri").unique(),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
});

export type SelectTrack = InferSelectModel<typeof tracks>;
export type InsertTrack = InferInsertModel<typeof tracks>;

export default tracks;
