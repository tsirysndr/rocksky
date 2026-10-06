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

// Labels and companies share one table because Discogs gives them the same
// shape; `kind` says which list an entry came from. Companies are the
// "Pressed By" / "Distributed By" / "Phonographic Copyright (p)" entries,
// which is why entity_type is worth keeping.
const discogsReleaseLabels = pgTable(
  "discogs_release_labels",
  {
    id: text("xata_id").primaryKey().default(sql`xata_id()`),
    releaseId: text("release_id")
      .notNull()
      .references(() => discogsReleases.id),
    labelId: integer("label_id"),
    name: text("name").notNull(),
    catalogNumber: text("catalog_number"),
    kind: text("kind").notNull(),
    entityType: text("entity_type"),
    position: integer("position").notNull(),
    createdAt: timestamp("xata_createdat").defaultNow().notNull(),
    updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
    xataVersion: integer("xata_version"),
  },
  (t) => [
    index("discogs_release_labels_release_id_idx").on(t.releaseId),
    index("discogs_release_labels_label_id_idx").on(t.labelId),
    unique("discogs_release_labels_release_id_kind_position_unique").on(
      t.releaseId,
      t.kind,
      t.position,
    ),
  ],
);

export type SelectDiscogsReleaseLabel = InferSelectModel<
  typeof discogsReleaseLabels
>;
export type InsertDiscogsReleaseLabel = InferInsertModel<
  typeof discogsReleaseLabels
>;

export default discogsReleaseLabels;
