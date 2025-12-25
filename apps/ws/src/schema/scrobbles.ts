import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import albums from "./albums.ts";
import artists from "./artists.ts";
import tracks from "./tracks.ts";
import users from "./users.ts";

const scrobbles = pgTable("scrobbles", {
  id: text("xata_id")
    .primaryKey()
    .default(sql`xata_id()`),
  userId: text("user_id").references(() => users.id),
  trackId: text("track_id").references(() => tracks.id),
  albumId: text("album_id").references(() => albums.id),
  artistId: text("artist_id").references(() => artists.id),
  uri: text("uri").unique(),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer("xata_version"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export type SelectScrobble = InferSelectModel<typeof scrobbles>;
export type InsertScrobble = InferInsertModel<typeof scrobbles>;

export default scrobbles;
