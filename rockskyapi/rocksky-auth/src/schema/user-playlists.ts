import { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import tracks from "./tracks";
import users from "./users";

const userPlaylists = pgTable("user_playlists", {
  id: text("xata_id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  playlistId: text("playlist_id")
    .notNull()
    .references(() => tracks.id),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  uri: text("uri").unique().notNull(),
});

export type SelectUserPlaylist = InferSelectModel<typeof userPlaylists>;
export type InsertUserPlaylist = InferInsertModel<typeof userPlaylists>;

export default userPlaylists;
