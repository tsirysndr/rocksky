import { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import albums from "./albums";
import users from "./users";

const userAlbums = pgTable("user_albums", {
  id: text("xata_id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  albumId: text("album_id")
    .notNull()
    .references(() => albums.id),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  uri: text("uri").unique().notNull(),
});

export type SelectUserAlbum = InferSelectModel<typeof userAlbums>;
export type InsertUserAlbum = InferInsertModel<typeof userAlbums>;

export default userAlbums;
