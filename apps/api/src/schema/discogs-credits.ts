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

// Performance and production credits for a release: Discogs' extraartists,
// plus the matched track's own. Rewritten wholesale whenever the release is
// re-fetched, so `position` is just the order Discogs listed them in.
const discogsCredits = pgTable(
  "discogs_credits",
  {
    id: text("xata_id").primaryKey().default(sql`xata_id()`),
    releaseId: text("release_id")
      .notNull()
      .references(() => discogsReleases.id),
    artistId: integer("artist_id"),
    name: text("name").notNull(),
    // Discogs' own wording: "Written-By", "Mixed By, Engineer".
    role: text("role"),
    // Track positions the credit applies to, null when it covers the release.
    tracks: text("tracks"),
    position: integer("position").notNull(),
    createdAt: timestamp("xata_createdat").defaultNow().notNull(),
    updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
    xataVersion: integer("xata_version"),
  },
  (t) => [
    index("discogs_credits_release_id_idx").on(t.releaseId),
    index("discogs_credits_artist_id_idx").on(t.artistId),
    unique("discogs_credits_release_id_position_unique").on(
      t.releaseId,
      t.position,
    ),
  ],
);

export type SelectDiscogsCredit = InferSelectModel<typeof discogsCredits>;
export type InsertDiscogsCredit = InferInsertModel<typeof discogsCredits>;

export default discogsCredits;
