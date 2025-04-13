import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import users from "./users";

const apiKeys = pgTable("api_keys", {
  id: text("xata_id").primaryKey(),
  name: text("name").notNull(),
  apiKey: text("api_key").notNull(),
  sharedSecret: text("shared_secret").notNull(),
  description: text("description"),
  enabled: boolean("enabled").default(true).notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
});

export default apiKeys;
