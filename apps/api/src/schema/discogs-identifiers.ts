import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import discogsReleases from "./discogs-releases";

// Every identifier printed on the release: Barcode, Matrix / Runout, Label
// Code, Rights Society, ASIN. discogs_releases keeps only the barcode, so this
// is where a pressing is actually identifiable from.
const discogsIdentifiers = pgTable(
  "discogs_identifiers",
  {
    id: text("xata_id").primaryKey().default(sql`xata_id()`),
    releaseId: text("release_id")
      .notNull()
      .references(() => discogsReleases.id),
    type: text("type").notNull(),
    value: text("value"),
    description: text("description"),
    position: integer("position").notNull(),
    createdAt: timestamp("xata_createdat").defaultNow().notNull(),
    updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
    xataVersion: integer("xata_version"),
  },
  (t) => [
    index("discogs_identifiers_release_id_idx").on(t.releaseId),
    index("discogs_identifiers_type_value_idx").on(t.type, t.value),
    unique("discogs_identifiers_release_id_position_unique").on(
      t.releaseId,
      t.position,
    ),
  ],
);

export type SelectDiscogsIdentifier = InferSelectModel<
  typeof discogsIdentifiers
>;
export type InsertDiscogsIdentifier = InferInsertModel<
  typeof discogsIdentifiers
>;

export default discogsIdentifiers;
