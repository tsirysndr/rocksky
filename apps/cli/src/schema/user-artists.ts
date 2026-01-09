import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import artists from "./artists";
import users from "./users";

const userArtists = sqliteTable("user_albums", {
  id: text("id").primaryKey().notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  albumId: text("artist_id")
    .notNull()
    .references(() => artists.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  scrobbles: integer("scrobbles"),
  uri: text("uri").unique().notNull(),
});

export type SelectUserArtist = InferSelectModel<typeof userArtists>;
export type InsertUserArtist = InferInsertModel<typeof userArtists>;

export default userArtists;
