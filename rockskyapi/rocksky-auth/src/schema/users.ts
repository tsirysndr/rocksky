import { InferSelectModel } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

const users = pgTable("users", {
  id: text("xata_id").primaryKey(),
  did: text("did").unique().notNull(),
  displayName: text("display_name").notNull(),
  handle: text("handle").unique().notNull(),
  avatar: text("avatar").notNull(),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
});

export type SelectUser = InferSelectModel<typeof users>;
export type InsertUser = InferSelectModel<typeof users>;

export default users;
