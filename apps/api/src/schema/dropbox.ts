import { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import dropboxTokens from "./dropbox-tokens";
import users from "./users";

const dropbox = pgTable("dropbox", {
  id: text("xata_id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  dropboxTokenId: text("dropbox_token_id")
    .notNull()
    .references(() => dropboxTokens.id),
  xataVersion: text("xata_version").notNull(),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
});

export type SelectDropbox = InferSelectModel<typeof dropbox>;
export type InsertDropbox = InferInsertModel<typeof dropbox>;

export default dropbox;
