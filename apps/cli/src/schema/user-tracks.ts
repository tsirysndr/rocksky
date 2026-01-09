import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import tracks from "./tracks";
import users from "./users";

const userTracks = sqliteTable("user_tracks", {
  id: text("id").primaryKey().notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  albumId: text("track_id")
    .notNull()
    .references(() => tracks.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  scrobbles: integer("scrobbles"),
  uri: text("uri").unique().notNull(),
});

export type SelectUser = InferSelectModel<typeof userTracks>;
export type InsertUserTrack = InferInsertModel<typeof userTracks>;

export default userTracks;
