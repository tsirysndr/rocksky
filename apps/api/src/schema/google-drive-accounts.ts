import { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import users from "./users";

const googleDriveAccounts = pgTable("google_drive_accounts", {
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

export type SelectGoogleDriveAccounts = InferSelectModel<
  typeof googleDriveAccounts
>;
export type InsertGoogleDriveAccounts = InferInsertModel<
  typeof googleDriveAccounts
>;

export default googleDriveAccounts;
