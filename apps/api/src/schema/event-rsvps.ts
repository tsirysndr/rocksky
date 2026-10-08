import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import events from "./events";
import users from "./users";

// community.lexicon.calendar.rsvp records whose subject is an indexed event.
// One row per (event, user): a newer rsvp record from the same user replaces
// the older one's uri and status.
const eventRsvps = pgTable(
  "event_rsvps",
  {
    id: text("xata_id").primaryKey().default(sql`xata_id()`),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    uri: text("uri").unique().notNull(),
    cid: text("cid"),
    // A community.lexicon.calendar.rsvp status token.
    status: text("status").notNull(),
    createdAt: timestamp("xata_createdat").defaultNow().notNull(),
    updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("event_rsvps_event_user_idx").on(table.eventId, table.userId),
    index("event_rsvps_user_id_idx").on(table.userId),
  ],
);

export type SelectEventRsvp = InferSelectModel<typeof eventRsvps>;
export type InsertEventRsvp = InferInsertModel<typeof eventRsvps>;

export default eventRsvps;
