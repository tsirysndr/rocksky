import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import albums from "./albums";
import users from "./users";

const userAlbums = sqliteTable(
  "user_albums",
  {
    id: text("id").primaryKey().notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    albumId: text("album_id")
      .notNull()
      .references(() => albums.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    scrobbles: integer("scrobbles"),
    uri: text("uri").unique().notNull(),
  },
  (t) => [unique("user_albums_unique_index").on(t.userId, t.albumId)],
);

export type SelectUserAlbum = InferSelectModel<typeof userAlbums>;
export type InsertUserAlbum = InferInsertModel<typeof userAlbums>;

export default userAlbums;
