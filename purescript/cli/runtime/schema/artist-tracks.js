import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import artists from "./artists.js";
import tracks from "./tracks.js";
const artistTracks = sqliteTable(
  "artist_tracks",
  {
    id: text("id").primaryKey().notNull(),
    artistId: text("artist_id").notNull().references(() => artists.id),
    trackId: text("track_id").notNull().references(() => tracks.id),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`)
  },
  (t) => [unique("artist_tracks_unique_index").on(t.artistId, t.trackId)]
);
var stdin_default = artistTracks;
export {
  stdin_default as default
};
