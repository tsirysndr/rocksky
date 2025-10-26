import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import googleDriveTokens from "./google-drive-tokens";
import users from "./users";

const googleDrive = pgTable("google_drive", {
  id: text("xata_id").primaryKey().default(sql`xata_id()`),
  googleDriveTokenId: text("google_drive_token_id")
    .notNull()
    .references(() => googleDriveTokens.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  xataVersion: text("xata_version"),
  createdAt: timestamp("xata_createdat", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("xata_updatedat", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type SelectGoogleDrive = InferSelectModel<typeof googleDrive>;
export type InsertGoogleDrive = InferInsertModel<typeof googleDrive>;

export default googleDrive;
