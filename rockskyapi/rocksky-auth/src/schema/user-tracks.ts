import { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import tracks from "./tracks";
import users from "./users";

const userTracks = pgTable("user_tracks", {
  id: text("xata_id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  trackId: text("track_id")
    .notNull()
    .references(() => tracks.id),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  uri: text("uri").unique().notNull(),
});

export type SelectUserTrack = InferSelectModel<typeof userTracks>;
export type InsertUserTrack = InferInsertModel<typeof userTracks>;

export default userTracks;
