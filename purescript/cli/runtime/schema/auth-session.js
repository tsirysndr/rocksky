import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
const authSessions = sqliteTable("auth_sessions", {
  key: text("key").primaryKey().notNull(),
  session: text("session").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`)
});
var stdin_default = authSessions;
export {
  stdin_default as default
};
