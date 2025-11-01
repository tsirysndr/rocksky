import { type InferSelectModel, sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

const users = pgTable("users", {
  id: text("xata_id").primaryKey().default(sql`xata_id()`),
  did: text("did").unique().notNull(),
  displayName: text("display_name"),
  handle: text("handle").unique().notNull(),
  avatar: text("avatar").notNull(),
  createdAt: timestamp("xata_createdat", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("xata_updatedat", { withTimezone: true })
    .defaultNow()
    .notNull(),
  xataVersion: integer("xata_version"),
});

export type SelectUser = InferSelectModel<typeof users>;
export type InsertUser = InferSelectModel<typeof users>;

export default users;
