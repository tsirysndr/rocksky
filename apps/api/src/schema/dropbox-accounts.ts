import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import users from "./users";

const dropboxAccounts = pgTable("dropbox_accounts", {
  id: text("xata_id").primaryKey(),
  email: text("email").unique().notNull(),
  isBetaUser: boolean("is_beta_user").default(false).notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  xataVersion: text("xata_version").notNull(),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
});

export type SelectDropboxAccounts = InferSelectModel<typeof dropboxAccounts>;
export type InsertDropboxAccounts = InferInsertModel<typeof dropboxAccounts>;

export default dropboxAccounts;
