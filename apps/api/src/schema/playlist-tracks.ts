import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import playlists from "./playlists";
import tracks from "./tracks";

const playlistTracks = pgTable("playlist_tracks", {
  id: text("xata_id")
    .primaryKey()
    .default(sql`xata_id()`),
  playlistId: text("playlist_id")
    .notNull()
    .references(() => playlists.id),
  trackId: text("track_id")
    .notNull()
    .references(() => tracks.id),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
});

export type SelectPlaylistTrack = InferSelectModel<typeof playlistTracks>;
export type InsertPlaylistTrack = InferInsertModel<typeof playlistTracks>;

export default playlistTracks;
