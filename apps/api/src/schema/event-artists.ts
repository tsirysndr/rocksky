import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import artists from "./artists";
import events from "./events";

// The lineup of an event, one row per billed artist, linked to the `artists`
// row the name (or the record's artist AT-URI) resolved to. `name` is the
// billing as written on the record, which can differ from artists.name.
const eventArtists = pgTable(
  "event_artists",
  {
    id: text("xata_id").primaryKey().default(sql`xata_id()`),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    artistId: text("artist_id")
      .notNull()
      .references(() => artists.id),
    name: text("name").notNull(),
    role: text("role"),
    stage: text("stage"),
    mbid: text("mbid"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("event_artists_event_artist_idx").on(
      table.eventId,
      table.artistId,
    ),
    index("event_artists_artist_id_idx").on(table.artistId),
  ],
);

export type SelectEventArtist = InferSelectModel<typeof eventArtists>;
export type InsertEventArtist = InferInsertModel<typeof eventArtists>;

export default eventArtists;
