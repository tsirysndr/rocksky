import { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import artists from "./artists";
import users from "./users";

const userArtists = pgTable("user_artists", {
  id: text("xata_id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  artistId: text("artist_id")
    .notNull()
    .references(() => artists.id),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  uri: text("uri").unique().notNull(),
});

export type SelectUserArtist = InferSelectModel<typeof userArtists>;
export type InsertUserArtist = InferInsertModel<typeof userArtists>;

export default userArtists;
