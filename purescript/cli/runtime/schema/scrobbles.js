import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import albums from "./albums.js";
import artists from "./artists.js";
import tracks from "./tracks.js";
import users from "./users.js";
const scrobbles = sqliteTable("scrobbles", {
  id: text("xata_id").primaryKey().notNull(),
  userId: text("user_id").references(() => users.id),
  trackId: text("track_id").references(() => tracks.id),
  albumId: text("album_id").references(() => albums.id),
  artistId: text("artist_id").references(() => artists.id),
  uri: text("uri").unique(),
  cid: text("cid").unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`)
});
var stdin_default = scrobbles;
export {
  stdin_default as default
};
