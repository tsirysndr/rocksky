import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

const artists = pgTable("artists", {
  id: text("xata_id").primaryKey().default(sql`xata_id()`),
  name: text("name").notNull(),
  biography: text("biography"),
  born: timestamp("born"),
  bornIn: text("born_in"),
  died: timestamp("died"),
  picture: text("picture"),
  sha256: text("sha256").unique().notNull(),
  uri: text("uri").unique(),
  appleMusicLink: text("apple_music_link"),
  spotifyLink: text("spotify_link"),
  tidalLink: text("tidal_link"),
  youtubeLink: text("youtube_link"),
  tidalId: integer("tidal_id").unique(),
  spotifyId: text("spotify_id").unique(),
  roles: text("roles").array(),
  genres: text("genres").array(),
  createdAt: timestamp("xata_createdat", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("xata_updatedat", { withTimezone: true })
    .defaultNow()
    .notNull(),
  xataVersion: integer("xata_version"),
});

export type SelectArtist = InferSelectModel<typeof artists>;
export type InsertArtist = InferInsertModel<typeof artists>;

export default artists;
