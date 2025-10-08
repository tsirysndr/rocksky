import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import albums from "./albums";
import users from "./users";

const userAlbums = pgTable("user_albums", {
  id: text("xata_id").primaryKey().default(sql`xata_id()`),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  albumId: text("album_id")
    .notNull()
    .references(() => albums.id),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer("xata_version"),
  scrobbles: integer("scrobbles"),
  uri: text("uri").unique().notNull(),
});

export type SelectUserAlbum = InferSelectModel<typeof userAlbums>;
export type InsertUserAlbum = InferInsertModel<typeof userAlbums>;

export default userAlbums;
