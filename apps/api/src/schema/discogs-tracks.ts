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

// The release's tracklist as printed. `position` is Discogs' own ("7", "2-04",
// "C2"); discNumber/trackNumber are the parsed form, and vinyl numbering stays
// side-relative. Headings and index entries are kept with their `type` so a
// reader can show the sleeve faithfully or filter to playable tracks.
const discogsTracks = pgTable(
  "discogs_tracks",
  {
    id: text("xata_id").primaryKey().default(sql`xata_id()`),
    releaseId: text("release_id")
      .notNull()
      .references(() => discogsReleases.id),
    position: text("position"),
    type: text("type"),
    title: text("title").notNull(),
    duration: text("duration"),
    durationMs: integer("duration_ms"),
    discNumber: integer("disc_number"),
    trackNumber: integer("track_number"),
    // Order within the tracklist, since `position` is neither unique nor
    // sortable across vinyl sides.
    idx: integer("idx").notNull(),
    createdAt: timestamp("xata_createdat").defaultNow().notNull(),
    updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
    xataVersion: integer("xata_version"),
  },
  (t) => [
    index("discogs_tracks_release_id_idx").on(t.releaseId),
    unique("discogs_tracks_release_id_idx_unique").on(t.releaseId, t.idx),
  ],
);

export type SelectDiscogsTrack = InferSelectModel<typeof discogsTracks>;
export type InsertDiscogsTrack = InferInsertModel<typeof discogsTracks>;

export default discogsTracks;
