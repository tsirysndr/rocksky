import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const authSessions = sqliteTable("auth_sessions", {
  key: text("key").primaryKey().notNull(),
  session: text("session").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type SelectAuthSession = InferSelectModel<typeof authSessions>;
export type InsertAuthSession = InferInsertModel<typeof authSessions>;

export default authSessions;
