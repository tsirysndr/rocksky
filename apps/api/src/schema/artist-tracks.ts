import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import artists from "./artists";
import tracks from "./tracks";

const artistTracks = pgTable("artist_tracks", {
  id: text("xata_id").primaryKey(),
  artistId: text("artist_id")
    .notNull()
    .references(() => artists.id),
  trackId: text("track_id")
    .notNull()
    .references(() => tracks.id),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer("xata_version").notNull(),
});

export type SelectArtistTrack = InferSelectModel<typeof artistTracks>;
export type InsertArtistTrack = InferInsertModel<typeof artistTracks>;

export default artistTracks;
