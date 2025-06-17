import { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import albums from "./albums";
import tracks from "./tracks";

const albumTracks = pgTable("album_tracks", {
  id: text("xata_id").primaryKey(),
  albumId: text("album_id")
    .notNull()
    .references(() => albums.id),
  trackId: text("track_id")
    .notNull()
    .references(() => tracks.id),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer("xata_version").notNull(),
});

export type SelectAlbumTrack = InferSelectModel<typeof albumTracks>;
export type InsertAlbumTrack = InferInsertModel<typeof albumTracks>;

export default albumTracks;
