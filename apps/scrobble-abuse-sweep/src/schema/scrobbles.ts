import { type InferSelectModel, sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Read-only view of the scrobbles table — just the columns the detector reads.
// FK references are intentionally omitted so this app stays self-contained.
const scrobbles = pgTable("scrobbles", {
  id: text("xata_id")
    .primaryKey()
    .default(sql`xata_id()`),
  userId: text("user_id"),
  trackId: text("track_id"),
  albumId: text("album_id"),
  artistId: text("artist_id"),
  uri: text("uri"),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer("xata_version"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export type SelectScrobble = InferSelectModel<typeof scrobbles>;

export default scrobbles;
