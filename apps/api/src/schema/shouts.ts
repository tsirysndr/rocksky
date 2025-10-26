import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import albums from "./albums";
import scrobbles from "./scrobbles";
import tracks from "./tracks";
import users from "./users";

const shouts = pgTable("shouts", {
  id: text("xata_id").primaryKey().default(sql`xata_id()`),
  content: text("content").notNull(),
  trackId: text("track_id").references(() => tracks.id),
  artistId: text("artist_id").references(() => users.id),
  albumId: text("album_id").references(() => albums.id),
  scrobbleId: text("scrobble_id").references(() => scrobbles.id),
  uri: text("uri").unique().notNull(),
  authorId: text("author_id")
    .references(() => users.id)
    .notNull(),
  parentId: text("parent_id").references(() => shouts.id),
  createdAt: timestamp("xata_createdat", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("xata_updatedat", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type SelectShout = InferSelectModel<typeof shouts>;
export type InsertShout = InferInsertModel<typeof shouts>;

export default shouts;
