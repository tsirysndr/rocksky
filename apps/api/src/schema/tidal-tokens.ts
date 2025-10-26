import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import users from "./users";

const tidalTokens = pgTable("tidal_tokens", {
  id: text("xata_id").primaryKey().default(sql`xata_id()`),
  xataVersion: integer("xata_version"),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
});

export type SelectTidalToken = InferSelectModel<typeof tidalTokens>;
export type InsertTidalToken = InferInsertModel<typeof tidalTokens>;

export default tidalTokens;
