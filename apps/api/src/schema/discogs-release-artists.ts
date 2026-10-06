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

// The artists credited on the release itself, in Discogs' order. joinPhrase is
// what separates this artist from the next ("Feat.", "&", ","), which is what
// makes the full credit string rebuildable.
const discogsReleaseArtists = pgTable(
  "discogs_release_artists",
  {
    id: text("xata_id").primaryKey().default(sql`xata_id()`),
    releaseId: text("release_id")
      .notNull()
      .references(() => discogsReleases.id),
    artistId: integer("artist_id"),
    name: text("name").notNull(),
    // The name as credited on this release, when it differs.
    anv: text("anv"),
    joinPhrase: text("join_phrase"),
    role: text("role"),
    position: integer("position").notNull(),
    createdAt: timestamp("xata_createdat").defaultNow().notNull(),
    updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
    xataVersion: integer("xata_version"),
  },
  (t) => [
    index("discogs_release_artists_release_id_idx").on(t.releaseId),
    index("discogs_release_artists_artist_id_idx").on(t.artistId),
    unique("discogs_release_artists_release_id_position_unique").on(
      t.releaseId,
      t.position,
    ),
  ],
);

export type SelectDiscogsReleaseArtist = InferSelectModel<
  typeof discogsReleaseArtists
>;
export type InsertDiscogsReleaseArtist = InferInsertModel<
  typeof discogsReleaseArtists
>;

export default discogsReleaseArtists;
