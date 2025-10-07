import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import users from "./users";

const playlists = pgTable("playlists", {
  id: text("xata_id")
    .primaryKey()
    .default(sql`xata_id()`),
  name: text("name").notNull(),
  picture: text("picture"),
  description: text("description"),
  uri: text("uri").unique(),
  spotifyLink: text("spotify_link"),
  tidalLink: text("tidal_link"),
  appleMusicLink: text("apple_music_link"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
});

export type SelectPlaylist = InferSelectModel<typeof playlists>;
export type InsertPlaylist = InferInsertModel<typeof playlists>;

export default playlists;
