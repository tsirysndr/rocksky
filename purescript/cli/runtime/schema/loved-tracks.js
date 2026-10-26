import { sql } from "drizzle-orm";
import { sqliteTable, integer, text, unique } from "drizzle-orm/sqlite-core";
import tracks from "./tracks.js";
import users from "./users.js";
const lovedTracks = sqliteTable(
  "loved_tracks",
  {
    id: text("id").primaryKey().notNull(),
    userId: text("user_id").notNull().references(() => users.id),
    trackId: text("track_id").notNull().references(() => tracks.id),
    uri: text("uri").unique(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch())`)
  },
  (t) => [unique("loved_tracks_unique_index").on(t.userId, t.trackId)]
);
var stdin_default = lovedTracks;
export {
  stdin_default as default
};
