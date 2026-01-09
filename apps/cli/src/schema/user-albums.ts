import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import albums from "./albums";
import users from "./users";

const userAlbums = sqliteTable("user_albums", {
  id: text("id").primaryKey().notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  albumId: text("album_id")
    .notNull()
    .references(() => albums.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  scrobbles: integer("scrobbles"),
  uri: text("uri").unique().notNull(),
});

export type SelectUserAlbum = InferSelectModel<typeof userAlbums>;
export type InsertUserAlbum = InferInsertModel<typeof userAlbums>;

export default userAlbums;
