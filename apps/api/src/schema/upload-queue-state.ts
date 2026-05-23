import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import users from "./users";

const uploadQueueState = pgTable("upload_queue_state", {
  id: text("xata_id").primaryKey().default(sql`xata_id()`),
  userId: text("user_id").notNull().unique().references(() => users.id),
  uploadIds: text("upload_ids").notNull().default("[]"),
  currentIndex: integer("current_index").notNull().default(0),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer("xata_version"),
});

export type SelectUploadQueueState = InferSelectModel<typeof uploadQueueState>;
export type InsertUploadQueueState = InferInsertModel<typeof uploadQueueState>;

export default uploadQueueState;
