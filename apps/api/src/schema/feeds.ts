import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import users from "./users";

const feeds = pgTable("feeds", {
  id: text("xata_id").primaryKey().default(sql`xata_id()`),
  displayName: text("display_name").notNull(),
  description: text("description"),
  did: text("did").notNull(),
  uri: text("uri").notNull().unique(),
  avatar: text("avatar"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  xataVersion: integer("xata_version"),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
});

export type SelectFeed = InferSelectModel<typeof feeds>;
export type InsertFeed = InferInsertModel<typeof feeds>;

export default feeds;
