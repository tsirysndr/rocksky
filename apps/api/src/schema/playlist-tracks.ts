import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import playlists from "./playlists";
import tracks from "./tracks";
import users from "./users";

const playlistTracks = pgTable(
  "playlist_tracks",
  {
    id: text("xata_id").primaryKey().default(sql`xata_id()`),
    playlistId: text("playlist_id")
      .notNull()
      .references(() => playlists.id),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id),
    // AT-URI and CID of the app.rocksky.playlist.song record this row mirrors.
    // The URI is the sync key: ingest upserts on it and deletes by it, so a row
    // cannot exist without a record behind it.
    uri: text("uri").unique(),
    cid: text("cid"),
    // The repo that authored the entry — always the playlist owner today.
    addedBy: text("added_by").references(() => users.id),
    // `addedAt` from the record, which is what the playlist is ordered by.
    // Distinct from createdAt, which is when we happened to ingest it.
    addedAt: timestamp("added_at", { withTimezone: true }),
    createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  },
  (table) => [
    index("playlist_tracks_playlist_id_added_at_idx").on(
      table.playlistId,
      table.addedAt,
    ),
  ],
);

export type SelectPlaylistTrack = InferSelectModel<typeof playlistTracks>;
export type InsertPlaylistTrack = InferInsertModel<typeof playlistTracks>;

export default playlistTracks;
