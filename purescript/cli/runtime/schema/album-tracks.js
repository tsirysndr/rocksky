import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import albums from "./albums.js";
import tracks from "./tracks.js";
const albumTracks = sqliteTable(
  "album_tracks",
  {
    id: text("id").primaryKey().notNull(),
    albumId: text("album_id").notNull().references(() => albums.id),
    trackId: text("track_id").notNull().references(() => tracks.id),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`)
  },
  (t) => [unique("album_tracks_unique_index").on(t.albumId, t.trackId)]
);
var stdin_default = albumTracks;
export {
  stdin_default as default
};
