import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import shouts from "./shouts";
import users from "./users";

const profileShouts = pgTable("profile_shouts", {
  id: text("xata_id").primaryKey().default(sql`xata_id()`),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  shoutId: text("shout_id")
    .notNull()
    .references(() => shouts.id),
  createdAt: timestamp("xata_createdat", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type SelectProfileShout = InferSelectModel<typeof profileShouts>;
export type InsertProfileShout = InferInsertModel<typeof profileShouts>;

export default profileShouts;
