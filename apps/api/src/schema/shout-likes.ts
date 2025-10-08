import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import shouts from "./shouts";
import users from "./users";

const shoutLikes = pgTable("shout_likes", {
  id: text("xata_id").primaryKey().default(sql`xata_id()`),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  shoutId: text("shout_id")
    .notNull()
    .references(() => shouts.id),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  uri: text("uri").unique().notNull(),
});

export type SelectShoutLike = InferSelectModel<typeof shoutLikes>;
export type InsertShoutLike = InferInsertModel<typeof shoutLikes>;

export default shoutLikes;
