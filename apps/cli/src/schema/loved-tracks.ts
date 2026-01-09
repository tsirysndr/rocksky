import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import tracks from "./tracks";
import users from "./users";

const lovedTracks = sqliteTable("loved_tracks", {
  id: text("id").primaryKey().notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  trackId: text("track_id")
    .notNull()
    .references(() => tracks.id),
  uri: text("uri").unique(),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type SelectLovedTrack = InferSelectModel<typeof lovedTracks>;
export type InsertLovedTrack = InferInsertModel<typeof lovedTracks>;

export default lovedTracks;
