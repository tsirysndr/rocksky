import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import users from "./users";

const tidalAccounts = pgTable("tidal_accounts", {
  id: text("xata_id")
    .primaryKey()
    .default(sql`xata_id()`),
  xataVersion: integer("xata_version"),
  tidalUserId: text("tidal_user_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
});

export type SelectTidalAccount = InferSelectModel<typeof tidalAccounts>;
export type InsertTidalAccount = InferInsertModel<typeof tidalAccounts>;

export default tidalAccounts;
