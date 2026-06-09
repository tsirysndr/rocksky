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
