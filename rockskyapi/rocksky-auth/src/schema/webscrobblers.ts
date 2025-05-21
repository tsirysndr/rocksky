import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import users from "./users";

const webscrobblers = pgTable("webscrobblers", {
  id: text("xata_id").primaryKey(),
  name: text("name").notNull(),
  uuid: text("uuid").notNull(),
  description: text("description"),
  enabled: boolean("enabled").default(true).notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
});

export default webscrobblers;
