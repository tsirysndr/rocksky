import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import tracks from "./tracks";
import users from "./users";

const userUploads = pgTable(
  "user_uploads",
  {
    id: text("xata_id").primaryKey().default(sql`xata_id()`),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id),
    r2Key: text("r2_key").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: integer("file_size").notNull(),
    originalFilename: text("original_filename").notNull(),
    uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
    createdAt: timestamp("xata_createdat").defaultNow().notNull(),
    updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
    xataVersion: integer("xata_version"),
  },
  (t) => [
    index("user_uploads_user_id_idx").on(t.userId),
    index("user_uploads_track_id_idx").on(t.trackId),
  ],
);

export type SelectUserUpload = InferSelectModel<typeof userUploads>;
export type InsertUserUpload = InferInsertModel<typeof userUploads>;

export default userUploads;
