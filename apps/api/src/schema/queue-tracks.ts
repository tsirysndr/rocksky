import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import tracks from "./tracks";
import users from "./users";

const queueTracks = pgTable("queue_tracks", {
  id: text("xata_id").primaryKey().default(sql`xata_id()`),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  trackId: text("track_id")
    .notNull()
    .references(() => tracks.id),
  position: integer("position").notNull(),
  fileUri: text("file_uri").notNull(),
  version: integer("xata_version").default(0).notNull(),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
});

export type SelectQueueTrack = InferSelectModel<typeof queueTracks>;
export type InsertQueueTrack = InferInsertModel<typeof queueTracks>;

export default queueTracks;
