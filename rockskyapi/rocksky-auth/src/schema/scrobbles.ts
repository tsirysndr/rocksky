import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

import albums from "./albums";
import artists from "./artists";
import tracks from "./tracks";
import users from "./users";

const scrobbles = pgTable("scrobbles", {
  id: text("xata_id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  trackId: text("track_id").references(() => tracks.id),
  albumId: text("album_id").references(() => albums.id),
  artistId: text("artist_id").references(() => artists.id),
  uri: text("uri").unique(),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export default scrobbles;
