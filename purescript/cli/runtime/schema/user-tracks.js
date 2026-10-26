import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import tracks from "./tracks.js";
import users from "./users.js";
const userTracks = sqliteTable(
  "user_tracks",
  {
    id: text("id").primaryKey().notNull(),
    userId: text("user_id").notNull().references(() => users.id),
    trackId: text("track_id").notNull().references(() => tracks.id),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
    scrobbles: integer("scrobbles"),
    uri: text("uri").unique().notNull()
  },
  (t) => [unique("user_tracks_unique_index").on(t.userId, t.trackId)]
);
var stdin_default = userTracks;
export {
  stdin_default as default
};
