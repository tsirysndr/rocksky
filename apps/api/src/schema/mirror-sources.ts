import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import users from "./users";

const mirrorSources = pgTable(
  "mirror_sources",
  {
    id: text("xata_id").primaryKey().default(sql`xata_id()`),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    provider: text("provider").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    externalUsername: text("external_username"),
    encryptedApiKey: text("encrypted_api_key"),
    lastPolledAt: timestamp("last_polled_at"),
    lastScrobbleSeenAt: timestamp("last_scrobble_seen_at"),
    createdAt: timestamp("xata_createdat").defaultNow().notNull(),
    updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
    xataVersion: integer("xata_version"),
  },
  (t) => [
    uniqueIndex("mirror_sources_user_provider_idx").on(t.userId, t.provider),
    index("mirror_sources_enabled_provider_idx").on(t.enabled, t.provider),
  ],
);

export type SelectMirrorSource = InferSelectModel<typeof mirrorSources>;
export type InsertMirrorSource = InferInsertModel<typeof mirrorSources>;

export default mirrorSources;
