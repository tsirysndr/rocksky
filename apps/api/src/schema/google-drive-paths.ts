import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import googleDriveDirectories from "./google-drive-directories";

const googleDrivePaths = pgTable("google_drive_paths", {
  id: text("xata_id")
    .primaryKey()
    .default(sql`xata_id()`),
  googleDriveId: text("google_drive_id").notNull(),
  trackId: text("track_id").notNull(),
  name: text("name").notNull(),
  directoryId: text("directory_id").references(() => googleDriveDirectories.id),
  fileId: text("file_id").notNull().unique(),
  xataVersion: text("xata_version"),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
});

export type SelectGoogleDrivePaths = InferSelectModel<typeof googleDrivePaths>;
export type InsertGoogleDrivePaths = InferInsertModel<typeof googleDrivePaths>;

export default googleDrivePaths;
