import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import discogsReleases from "./discogs-releases";

// One row per artist+album we have asked Discogs about. Scrobbles repeat
// endlessly, so this is what keeps a replayed album off the 60-requests-per-
// minute quota. A null release_id is a recorded miss, retried once it goes
// stale (see isStaleSearch).
const discogsSearches = pgTable(
  "discogs_searches",
  {
    id: text("xata_id").primaryKey().default(sql`xata_id()`),
    sha256: text("sha256").unique().notNull(),
    artist: text("artist").notNull(),
    album: text("album").notNull(),
    releaseId: text("release_id").references(() => discogsReleases.id),
    score: real("score"),
    searchedAt: timestamp("searched_at").defaultNow().notNull(),
    createdAt: timestamp("xata_createdat").defaultNow().notNull(),
    updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
    xataVersion: integer("xata_version"),
  },
  (t) => [index("discogs_searches_release_id_idx").on(t.releaseId)],
);

export type SelectDiscogsSearch = InferSelectModel<typeof discogsSearches>;
export type InsertDiscogsSearch = InferInsertModel<typeof discogsSearches>;

export default discogsSearches;
