import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import users from "./users";

// A music event is a community.lexicon.calendar.event record plus the
// app.rocksky.event.music record that marks it as one and names the lineup.
// Both halves live in one row: a calendar event without the music annotation
// is never indexed, and dropping the annotation drops the row.
//
// Rows are written by jetstream only (crates/jetstream/src/event.rs).
const events = pgTable(
  "events",
  {
    id: text("xata_id").primaryKey().default(sql`xata_id()`),
    uri: text("uri").unique().notNull(),
    cid: text("cid"),
    musicUri: text("music_uri").unique().notNull(),
    musicCid: text("music_cid"),
    name: text("name").notNull(),
    description: text("description"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    mode: text("mode"),
    status: text("status"),
    // The record's `locations` and `uris` arrays, verbatim.
    locations: jsonb("locations").$type<Array<Record<string, unknown>>>(),
    uris: jsonb("uris").$type<Array<{ uri: string; name?: string }>>(),
    kind: text("kind"),
    genre: text("genre"),
    tags: text("tags").array(),
    externalIds: jsonb("external_ids").$type<Record<string, string>>(),
    ticketsUrl: text("tickets_url"),
    imageUrl: text("image_url"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    // Fingerprint of the show (headliner, day, venue); null for undated events.
    sha256: text("sha256"),
    // Set when another indexed event describes the same show, by fingerprint
    // or a shared external id. Readers list rows where this is null and pool
    // RSVPs across the group; the FK clears it when the canonical row goes.
    duplicateOf: text("duplicate_of").references((): AnyPgColumn => events.id, {
      onDelete: "set null",
    }),
    // The calendar record's own createdAt.
    createdAt: timestamp("created_at", { withTimezone: true }),
    xataCreatedAt: timestamp("xata_createdat").defaultNow().notNull(),
    updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
    xataVersion: integer("xata_version"),
  },
  (table) => [
    index("events_starts_at_idx").on(table.startsAt),
    index("events_created_by_idx").on(table.createdBy),
    index("events_sha256_idx").on(table.sha256),
    index("events_duplicate_of_idx").on(table.duplicateOf),
  ],
);

export type SelectEvent = InferSelectModel<typeof events>;
export type InsertEvent = InferInsertModel<typeof events>;

export default events;
