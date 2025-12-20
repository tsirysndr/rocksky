import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

const dropboxTokens = pgTable("dropbox_tokens", {
  id: text("xata_id").primaryKey().default(sql`xata_id()`),
  refreshToken: text("refresh_token").notNull(),
  createdAt: timestamp("xata_createdat", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("xata_updatedat", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type SelectDropboxToken = InferSelectModel<typeof dropboxTokens>;
export type InsertDropboxToken = InferInsertModel<typeof dropboxTokens>;

export default dropboxTokens;
