import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import tracks from "./tracks";
import users from "./users";

const userTracks = pgTable(
  "user_tracks",
  {
    id: text("xata_id").primaryKey().default(sql`xata_id()`),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id),
    createdAt: timestamp("xata_createdat").defaultNow().notNull(),
    updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
    xataVersion: integer("xata_version"),
    uri: text("uri").unique().notNull(),
    scrobbles: integer("scrobbles"),
  },
  // The unique index on (track_id, user_id) cannot serve a user_id lookup:
  // second position means no seek, so the profile's COUNT(*) read the whole
  // index. See drizzle/0028.
  (t) => [index("user_tracks_user_id_idx").on(t.userId)],
);

export type SelectUserTrack = InferSelectModel<typeof userTracks>;
export type InsertUserTrack = InferInsertModel<typeof userTracks>;

export default userTracks;
