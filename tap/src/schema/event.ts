import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

const events = sqliteTable(
  "events",
  {
    id: integer("id").primaryKey(),
    type: text("type").notNull(),
    action: text("action"),
    did: text("did").notNull(),
    // identity
    status: text("status"),
    handle: text("handle"),
    isActive: integer("is_active", { mode: "boolean" }),
    // record
    collection: text("collection"),
    rev: text("rev"),
    rkey: text("rkey"),
    record: text("record"),
    live: integer("live", { mode: "boolean" }),
    cid: text("cid").unique(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index("did_idx").on(t.did),
    index("type_idx").on(t.type),
    index("collection_idx").on(t.collection),
    index("did_collection_rkey_idx").on(t.did, t.collection, t.rkey),
  ],
);

export type SelectEvent = InferSelectModel<typeof events>;
export type InsertEvent = InferInsertModel<typeof events>;

export default events;
