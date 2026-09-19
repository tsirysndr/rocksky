import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import albums from "./albums";
import users from "./users";

const userAlbums = pgTable(
  "user_albums",
  {
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
  },
  // As user_tracks: the unique index leads with album_id. See drizzle/0028.
  (t) => [index("user_albums_user_id_idx").on(t.userId)],
);

export type SelectUserAlbum = InferSelectModel<typeof userAlbums>;
export type InsertUserAlbum = InferInsertModel<typeof userAlbums>;

export default userAlbums;
