import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
const users = sqliteTable("users", {
  id: text("id").primaryKey().notNull(),
  did: text("did").unique().notNull(),
  displayName: text("display_name"),
  handle: text("handle").unique().notNull(),
  avatar: text("avatar").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`)
});
var stdin_default = users;
export {
  stdin_default as default
};
