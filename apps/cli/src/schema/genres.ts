import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const genres = sqliteTable("genres", {
  id: text("id").primaryKey().notNull(),
  name: text("name").unique().notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type SelectGenre = InferSelectModel<typeof genres>;
export type InsertGenre = InferInsertModel<typeof genres>;

export default genres;
