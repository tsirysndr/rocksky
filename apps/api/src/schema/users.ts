import { type InferSelectModel, sql } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const users = pgTable("users", {
  id: text("xata_id").primaryKey().default(sql`xata_id()`),
  did: text("did").unique().notNull(),
  displayName: text("display_name").notNull(),
  handle: text("handle").unique().notNull(),
  avatar: text("avatar").notNull(),
  // Persistent bot flag, written by the scrobble-abuse-sweep service and
  // enforced on every scrobble (see lib/scrobbleGuard.ts#assertNotBotFlagged).
  isBot: boolean("is_bot").notNull().default(false),
  botFlaggedAt: timestamp("bot_flagged_at", { withTimezone: true }),
  botReason: text("bot_reason"),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer("xata_version"),
});

export type SelectUser = InferSelectModel<typeof users>;
export type InsertUser = InferSelectModel<typeof users>;

export default users;
