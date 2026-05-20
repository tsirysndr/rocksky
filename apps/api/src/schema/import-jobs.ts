import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import users from "./users";

const importJobs = pgTable(
  "import_jobs",
  {
    id: text("xata_id").primaryKey().default(sql`xata_id()`),
    userId: text("user_id").references(() => users.id),
    type: text("type").notNull(),
    status: text("status").notNull().default("pending"),
    total: integer("total").default(0),
    processed: integer("processed").default(0),
    failed: integer("failed").default(0),
    errors: text("errors"),
    createdAt: timestamp("xata_createdat").defaultNow().notNull(),
    updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
    xataVersion: integer("xata_version"),
  },
  (t) => [
    index("import_jobs_user_id_idx").on(t.userId),
    index("import_jobs_status_idx").on(t.status),
  ],
);

export type SelectImportJob = InferSelectModel<typeof importJobs>;
export type InsertImportJob = InferInsertModel<typeof importJobs>;

export default importJobs;
