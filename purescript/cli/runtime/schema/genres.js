import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
const genres = sqliteTable("genres", {
  id: text("id").primaryKey().notNull(),
  name: text("name").unique().notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`)
});
var stdin_default = genres;
export {
  stdin_default as default
};
