import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const follows = pgTable(
  "follows",
  {
    id: text("xata_id").primaryKey().default(sql`xata_id()`),
    uri: text("uri").notNull().unique(),
    follower_did: text("follower_did").notNull(),
    subject_did: text("subject_did").notNull(),
    xataVersion: integer("xata_version"),
    createdAt: timestamp("xata_createdat").defaultNow().notNull(),
    updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("follows_follower_subject_unique").on(
      t.follower_did,
      t.subject_did,
    ),
  ],
);

export type SelectFollows = InferSelectModel<typeof follows>;
export type InsertFollows = InferInsertModel<typeof follows>;

export default follows;
