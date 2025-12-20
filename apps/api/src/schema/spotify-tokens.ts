import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import users from "./users";

const spotifyTokens = pgTable("spotify_tokens", {
  id: text("xata_id").primaryKey().default(sql`xata_id()`),
  xataVersion: integer("xata_version"),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  spotifyAppId: text("spotify_app_id").notNull(),
  createdAt: timestamp("xata_createdat", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("xata_updatedat", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type SelectSpotifyToken = InferSelectModel<typeof spotifyTokens>;
export type InsertSpotifyToken = InferInsertModel<typeof spotifyTokens>;

export default spotifyTokens;
