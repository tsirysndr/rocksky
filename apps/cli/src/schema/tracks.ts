import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core";

const tracks = sqliteTable(
  "tracks",
  {
    id: text("id").primaryKey().notNull(),
    title: text("title").notNull(),
    artist: text("artist").notNull(),
    albumArtist: text("album_artist").notNull(),
    albumArt: text("album_art"),
    album: text("album").notNull(),
    trackNumber: integer("track_number"),
    duration: integer("duration").notNull(),
    mbId: text("mb_id").unique(),
    youtubeLink: text("youtube_link").unique(),
    spotifyLink: text("spotify_link").unique(),
    appleMusicLink: text("apple_music_link").unique(),
    tidalLink: text("tidal_link").unique(),
    discNumber: integer("disc_number"),
    lyrics: text("lyrics"),
    composer: text("composer"),
    genre: text("genre"),
    label: text("label"),
    copyrightMessage: text("copyright_message"),
    uri: text("uri").unique(),
    cid: text("cid").unique().notNull(),
    albumUri: text("album_uri"),
    artistUri: text("artist_uri"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    idx_title_artist_album_albumartist: index(
      "idx_title_artist_album_albumartist",
    ).on(t.title, t.artist, t.album, t.albumArtist),
  }),
);

export type SelectTrack = InferSelectModel<typeof tracks>;
export type InsertTrack = InferInsertModel<typeof tracks>;

export default tracks;
