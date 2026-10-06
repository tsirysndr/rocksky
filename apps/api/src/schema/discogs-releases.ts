import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const discogsReleases = pgTable(
  "discogs_releases",
  {
    id: text("xata_id").primaryKey().default(sql`xata_id()`),
    discogsId: integer("discogs_id").notNull().unique(),
    masterId: integer("master_id"),
    title: text("title").notNull(),
    artist: text("artist").notNull(),
    albumArt: text("album_art"),
    year: integer("year"),
    // The master's year: the original release, not this pressing.
    originalYear: integer("original_year"),
    releaseDate: text("release_date"),
    country: text("country"),
    label: text("label"),
    catalogNumber: text("catalog_number"),
    barcode: text("barcode"),
    formats: text("formats").array(),
    genres: text("genres").array(),
    styles: text("styles").array(),
    discogsUrl: text("discogs_url"),
    // Confidence of the match that produced this row, from the service.
    score: real("score"),
    // Null means credits were never fetched for this release, which is what
    // lets a release stored before credits existed be filled in later. It is
    // not the same as a release that genuinely has none.
    creditsFetchedAt: timestamp("credits_fetched_at"),
    createdAt: timestamp("xata_createdat").defaultNow().notNull(),
    updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
    xataVersion: integer("xata_version"),
  },
  (t) => [
    index("discogs_releases_master_id_idx").on(t.masterId),
    index("discogs_releases_artist_title_idx").on(t.artist, t.title),
  ],
);

export type SelectDiscogsRelease = InferSelectModel<typeof discogsReleases>;
export type InsertDiscogsRelease = InferInsertModel<typeof discogsReleases>;

export default discogsReleases;
