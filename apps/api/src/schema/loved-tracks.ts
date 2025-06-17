import { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import tracks from "./tracks";
import users from "./users";

const lovedTracks = pgTable("loved_tracks", {
  id: text("xata_id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  trackId: text("track_id")
    .notNull()
    .references(() => tracks.id),
  uri: text("uri").unique(),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
});

export type SelectLovedTrack = InferSelectModel<typeof lovedTracks>;
export type InsertLovedTrack = InferInsertModel<typeof lovedTracks>;

export default lovedTracks;
