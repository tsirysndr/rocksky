import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import tracks from "./tracks";
import users from "./users";

const userTracks = pgTable("user_tracks", {
  id: text("xata_id").primaryKey().default(sql`xata_id()`),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  trackId: text("track_id")
    .notNull()
    .references(() => tracks.id),
  createdAt: timestamp("xata_createdat", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("xata_updatedat", { withTimezone: true })
    .defaultNow()
    .notNull(),
  xataVersion: integer("xata_version"),
  uri: text("uri").unique().notNull(),
  scrobbles: integer("scrobbles"),
});

export type SelectUserTrack = InferSelectModel<typeof userTracks>;
export type InsertUserTrack = InferInsertModel<typeof userTracks>;

export default userTracks;
