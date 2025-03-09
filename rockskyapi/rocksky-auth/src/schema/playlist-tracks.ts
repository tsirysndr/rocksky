import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import playlists from "./playlists";
import tracks from "./tracks";

const playlistTracks = pgTable("playlist_tracks", {
  id: text("xata_id").primaryKey(),
  playlistId: text("playlist_id")
    .notNull()
    .references(() => playlists.id),
  trackId: text("track_id")
    .notNull()
    .references(() => tracks.id),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
});

export default playlistTracks;
