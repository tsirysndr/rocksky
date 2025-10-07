import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

const googleDriveDirectories = pgTable("google_drive_directories", {
  id: text("xata_id")
    .primaryKey()
    .default(sql`xata_id()`),
  name: text("name").notNull(),
  path: text("path").notNull(),
  parentId: text("parent_id").references(() => googleDriveDirectories.id),
  googleDriveId: text("google_drive_id").notNull(),
  fileId: text("file_id").notNull().unique(),
  xataVersion: text("xata_version"),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
});

export type SelectGoogleDriveDirectories = InferSelectModel<
  typeof googleDriveDirectories
>;
export type InsertGoogleDriveDirectories = InferInsertModel<
  typeof googleDriveDirectories
>;

export default googleDriveDirectories;
