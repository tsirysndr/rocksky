import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import users from "./users";

// Playlists created through the Navidrome (Subsonic-compatible) API. Kept in a
// dedicated table so they are isolated from playlists ingested from other
// sources (atproto records, Spotify imports, …).
const navidromePlaylists = pgTable("navidrome_playlists", {
  id: text("xata_id").primaryKey().default(sql`xata_id()`),
  name: text("name").notNull(),
  description: text("description"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("xata_createdat", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("xata_updatedat", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type SelectNavidromePlaylist = InferSelectModel<
  typeof navidromePlaylists
>;
export type InsertNavidromePlaylist = InferInsertModel<
  typeof navidromePlaylists
>;

export default navidromePlaylists;
