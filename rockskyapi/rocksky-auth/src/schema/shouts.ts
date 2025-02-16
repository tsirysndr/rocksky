import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import albums from "./albums";
import tracks from "./tracks";
import users from "./users";

const shouts = pgTable("shouts", {
  id: text("xata_id").primaryKey(),
  content: text("content").notNull(),
  trackId: text("track_id").references(() => tracks.id),
  artistId: text("artist_id").references(() => users.id),
  albumId: text("album_id").references(() => albums.id),
  uri: text("uri").unique().notNull(),
  authorId: text("author_id")
    .references(() => users.id)
    .notNull(),
  parentId: text("parent_id").references(() => shouts.id),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
});

export default shouts;
