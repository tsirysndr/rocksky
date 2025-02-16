import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

const users = pgTable("users", {
  id: text("xata_id").primaryKey(),
  did: text("did").unique().notNull(),
  displayName: text("display_name").notNull(),
  handle: text("handle").unique().notNull(),
  avatar: text("avatar").notNull(),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
});

export default users;
