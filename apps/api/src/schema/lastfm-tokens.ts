import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import users from "./users";

const lastfmTokens = pgTable("lastfm_tokens", {
  id: text("xata_id")
    .primaryKey()
    .default(sql`xata_id()`),
  xataVersion: integer("xata_version"),
  sessionKey: text("session_key").notNull(),
  user: text("user").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
});

export type SelectLastfmToken = InferSelectModel<typeof lastfmTokens>;
export type InsertLastfmToken = InferInsertModel<typeof lastfmTokens>;

export default lastfmTokens;
