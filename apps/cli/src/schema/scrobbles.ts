import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import albums from "./albums";
import artists from "./artists";
import tracks from "./tracks";
import users from "./users";

const scrobbles = sqliteTable("scrobbles", {
  id: text("xata_id").primaryKey().notNull(),
  userId: text("user_id").references(() => users.id),
  trackId: text("track_id").references(() => tracks.id),
  albumId: text("album_id").references(() => albums.id),
  artistId: text("artist_id").references(() => artists.id),
  uri: text("uri").unique(),
  cid: text("cid").unique(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  timestamp: integer("timestamp", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type SelectScrobble = InferSelectModel<typeof scrobbles>;
export type InsertScrobble = InferInsertModel<typeof scrobbles>;

export default scrobbles;
