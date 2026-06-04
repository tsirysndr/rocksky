import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import users from "./users";

const accessTokens = pgTable(
  "access_tokens",
  {
    id: text("xata_id").primaryKey().default(sql`xata_id()`),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    jti: text("jti").notNull().unique(),
    tokenEncrypted: text("token_encrypted").notNull(),
    lastFour: text("last_four").notNull(),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("xata_createdat").defaultNow().notNull(),
    updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
  },
  (t) => [index("access_tokens_user_id_idx").on(t.userId)],
);

export type SelectAccessToken = InferSelectModel<typeof accessTokens>;
export type InsertAccessToken = InferInsertModel<typeof accessTokens>;

export default accessTokens;
