import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import artists from "./artists.js";
import users from "./users.js";
const userArtists = sqliteTable(
  "user_artists",
  {
    id: text("id").primaryKey().notNull(),
    userId: text("user_id").notNull().references(() => users.id),
    artistId: text("artist_id").notNull().references(() => artists.id),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
    scrobbles: integer("scrobbles"),
    uri: text("uri").unique().notNull()
  },
  (t) => [unique("user_artists_unique_index").on(t.userId, t.artistId)]
);
var stdin_default = userArtists;
export {
  stdin_default as default
};
