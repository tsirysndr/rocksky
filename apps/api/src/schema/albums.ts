import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import discogsReleases from "./discogs-releases";

const albums = pgTable(
  "albums",
  {
    id: text("xata_id").primaryKey().default(sql`xata_id()`),
    title: text("title").notNull(),
    artist: text("artist").notNull(),
    releaseDate: text("release_date"),
    year: integer("year"),
    albumArt: text("album_art"),
    uri: text("uri").unique(),
    artistUri: text("artist_uri"),
    appleMusicLink: text("apple_music_link").unique(),
    spotifyLink: text("spotify_link").unique(),
    tidalLink: text("tidal_link").unique(),
    youtubeLink: text("youtube_link").unique(),
    sha256: text("sha256").unique().notNull(),
    discogsReleaseId: text("discogs_release_id").references(
      () => discogsReleases.id,
    ),
    createdAt: timestamp("xata_createdat").defaultNow().notNull(),
    updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
    xataVersion: integer("xata_version"),
  },
  (t) => [
    index("albums_catalog_recent_idx").on(t.createdAt.desc(), t.id),
    index("albums_title_id_idx").on(t.title, t.id),
    index("albums_artist_trgm_idx").using(
      "gin",
      sql`lower(${t.artist}) gin_trgm_ops`,
    ),
    index("albums_artist_id_idx").on(t.artist, t.id),
    index("albums_year_id_idx").on(t.year, t.id),
    index("albums_missing_artist_uri_idx")
      .on(t.artist)
      .where(sql`${t.artistUri} IS NULL`),
  ],
);

export type SelectAlbum = InferSelectModel<typeof albums>;
export type InsertAlbum = InferInsertModel<typeof albums>;

export default albums;
