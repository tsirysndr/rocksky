import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import shouts from "./shouts";
import users from "./users";

const shoutReports = pgTable("shout_reports", {
  id: text("xata_id").primaryKey().default(sql`xata_id()`),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  shoutId: text("shout_id")
    .notNull()
    .references(() => shouts.id),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
});

export type SelectShoutReport = InferSelectModel<typeof shoutReports>;
export type InsertShoutReport = InferInsertModel<typeof shoutReports>;

export default shoutReports;
