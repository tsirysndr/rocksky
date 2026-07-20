import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import navidromePlaylists from "./navidrome-playlists";
import tracks from "./tracks";

// Track membership for Navidrome-created playlists.
const navidromePlaylistTracks = pgTable("navidrome_playlist_tracks", {
  id: text("xata_id").primaryKey().default(sql`xata_id()`),
  playlistId: text("playlist_id")
    .notNull()
    .references(() => navidromePlaylists.id),
  trackId: text("track_id")
    .notNull()
    .references(() => tracks.id),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
});

export type SelectNavidromePlaylistTrack = InferSelectModel<
  typeof navidromePlaylistTracks
>;
export type InsertNavidromePlaylistTrack = InferInsertModel<
  typeof navidromePlaylistTracks
>;

export default navidromePlaylistTracks;
