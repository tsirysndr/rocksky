import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import shouts from "./shouts";
import users from "./users";

const scrobbles = pgTable("scrobbles", {
  id: text("xata_id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  trackId: text("track_id").references(() => shouts.id),
  albumId: text("album_id").references(() => shouts.id),
  artistId: text("artist_id").references(() => users.id),
  uri: text("uri").unique(),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
});

export default scrobbles;
