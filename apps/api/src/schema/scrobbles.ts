import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import albums from "./albums";
import artists from "./artists";
import tracks from "./tracks";
import users from "./users";

const scrobbles = pgTable(
  "scrobbles",
  {
    id: text("xata_id").primaryKey().default(sql`xata_id()`),
    userId: text("user_id").references(() => users.id),
    trackId: text("track_id").references(() => tracks.id),
    albumId: text("album_id").references(() => albums.id),
    artistId: text("artist_id").references(() => artists.id),
    uri: text("uri").unique(),
    createdAt: timestamp("xata_createdat").defaultNow().notNull(),
    updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
    xataVersion: integer("xata_version"),
    timestamp: timestamp("timestamp").defaultNow().notNull(),
  },
  (t) => [
    index("scrobbles_user_id_timestamp_idx").on(t.userId, t.timestamp),
    index("scrobbles_artist_id_idx").on(t.artistId),
    index("scrobbles_album_id_idx").on(t.albumId),
    index("scrobbles_track_id_idx").on(t.trackId),
    index("scrobbles_timestamp_idx").on(t.timestamp),
    // Lets a genre feed (see apps/feeds/src/algos) walk one artist's
    // scrobbles pre-sorted by time instead of resorting the whole filtered
    // set. Paired with the GIN index on artists.genres (0029).
    index("scrobbles_artist_id_timestamp_idx").on(t.artistId, t.timestamp.desc()),
    // Covers the artist's popular-tracks ranking — count(*) and
    // count(distinct user_id) grouped by track, for one artist — as an
    // index-only scan (0031).
    index("scrobbles_artist_track_user_idx").on(
      t.artistId,
      t.trackId,
      t.userId,
    ),
    unique("scrobbles_user_track_timestamp_unique").on(
      t.userId,
      t.trackId,
      t.timestamp,
    ),
  ],
);

export type SelectScrobble = InferSelectModel<typeof scrobbles>;
export type InsertScrobble = InferInsertModel<typeof scrobbles>;

export default scrobbles;
