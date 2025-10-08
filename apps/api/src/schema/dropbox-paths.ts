import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import dropboxDirectories from "./dropbox-directories";

const dropboxPaths = pgTable("dropbox_paths", {
  id: text("xata_id").primaryKey().default(sql`xata_id()`),
  path: text("path").notNull(),
  name: text("name").notNull(),
  dropboxId: text("dropbox_id").notNull(),
  trackId: text("track_id").notNull(),
  directoryId: text("directory_id").references(() => dropboxDirectories.id),
  fileId: text("file_id").notNull().unique(),
  xataVersion: text("xata_version"),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
});

export type SelectDropboxPaths = InferSelectModel<typeof dropboxPaths>;
export type InsertDropboxDirectories = InferInsertModel<typeof dropboxPaths>;

export default dropboxPaths;
