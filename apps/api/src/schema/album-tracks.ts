import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import albums from "./albums";
import tracks from "./tracks";

const albumTracks = pgTable("album_tracks", {
  id: text("xata_id").primaryKey().default(sql`xata_id()`),
  albumId: text("album_id")
    .notNull()
    .references(() => albums.id),
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
});

export type SelectAlbumTrack = InferSelectModel<typeof albumTracks>;
export type InsertAlbumTrack = InferInsertModel<typeof albumTracks>;

export default albumTracks;
