import { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import googleDriveTokens from "./google-drive-tokens";
import users from "./users";

const googleDrive = pgTable("google_drive", {
  id: text("xata_id").primaryKey(),
  googleDriveTokenId: text("google_drive_token_id")
    .notNull()
    .references(() => googleDriveTokens.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  xataVersion: text("xata_version").notNull(),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
});

export type SelectGoogleDrive = InferSelectModel<typeof googleDrive>;
export type InsertGoogleDrive = InferInsertModel<typeof googleDrive>;

export default googleDrive;
