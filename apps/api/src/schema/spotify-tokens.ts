import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import users from "./users";

const spotifyTokens = pgTable("spotify_tokens", {
  id: text("xata_id").primaryKey(),
  xataVersion: integer("xata_version").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
});

export type SelectSpotifyToken = InferSelectModel<typeof spotifyTokens>;
export type InsertSpotifyToken = InferInsertModel<typeof spotifyTokens>;

export default spotifyTokens;
