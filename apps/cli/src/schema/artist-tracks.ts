import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import artists from "./artists";
import tracks from "./tracks";

const artistTracks = sqliteTable(
  "artist_tracks",
  {
    id: text("id").primaryKey().notNull(),
    artistId: text("artist_id")
      .notNull()
      .references(() => artists.id),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [unique("artist_tracks_unique_index").on(t.artistId, t.trackId)],
);

export type SelectArtistTrack = InferSelectModel<typeof artistTracks>;
export type InsertArtistTrack = InferInsertModel<typeof artistTracks>;

export default artistTracks;
