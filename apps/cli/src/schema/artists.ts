import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const artists = sqliteTable("artists", {
  id: text("id").primaryKey().notNull(),
  name: text("name").notNull(),
  biography: text("biography"),
  born: integer("born", { mode: "timestamp" }),
  bornIn: text("born_in"),
  died: integer("died", { mode: "timestamp" }),
  picture: text("picture"),
  uri: text("uri").unique(),
  cid: text("cid").unique().notNull(),
  appleMusicLink: text("apple_music_link"),
  spotifyLink: text("spotify_link"),
  tidalLink: text("tidal_link"),
  youtubeLink: text("youtube_link"),
  genres: text("genres"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type SelectArtist = InferSelectModel<typeof artists>;
export type InsertArtist = InferInsertModel<typeof artists>;

export default artists;
