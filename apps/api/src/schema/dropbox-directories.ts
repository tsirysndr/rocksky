import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

const dropboxDirectories = pgTable("dropbox_directories", {
  id: text("xata_id").primaryKey().default(sql`xata_id()`),
  name: text("name").notNull(),
  path: text("path").notNull(),
  parentId: text("parent_id").references(() => dropboxDirectories.id),
  dropboxId: text("dropbox_id").notNull(),
  fileId: text("file_id").notNull().unique(),
  xataVersion: text("xata_version"),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
});

export type SelectDropboxDirectories = InferSelectModel<
  typeof dropboxDirectories
>;
export type InsertDropboxDirectories = InferInsertModel<
  typeof dropboxDirectories
>;

export default dropboxDirectories;
