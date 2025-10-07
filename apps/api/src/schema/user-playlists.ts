import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import playlists from "./playlists";
import users from "./users";

const userPlaylists = pgTable("user_playlists", {
  id: text("xata_id")
    .primaryKey()
    .default(sql`xata_id()`),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  playlistId: text("playlist_id")
    .notNull()
    .references(() => playlists.id),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  uri: text("uri").unique(),
});

export type SelectUserPlaylist = InferSelectModel<typeof userPlaylists>;
export type InsertUserPlaylist = InferInsertModel<typeof userPlaylists>;

export default userPlaylists;
