import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const tracks = pgTable(
  "tracks",
  {
    id: text("xata_id").primaryKey().default(sql`xata_id()`),
    title: text("title").notNull(),
    artist: text("artist").notNull(),
    albumArtist: text("album_artist").notNull(),
    albumArt: text("album_art"),
    album: text("album").notNull(),
    trackNumber: integer("track_number"),
    duration: integer("duration").notNull(),
    mbId: text("mb_id"),
    isrc: text("isrc"),
    youtubeLink: text("youtube_link").unique(),
    spotifyLink: text("spotify_link").unique(),
    appleMusicLink: text("apple_music_link").unique(),
    tidalLink: text("tidal_link").unique(),
    sha256: text("sha256").unique().notNull(),
    discNumber: integer("disc_number"),
    lyrics: text("lyrics"),
    composer: text("composer"),
    genre: text("genre"),
    label: text("label"),
    copyrightMessage: text("copyright_message"),
    key: text("key"),
    bpm: real("bpm"),
    acoustidFingerprint: text("acoustid_fingerprint"),
    uri: text("uri").unique(),
    albumUri: text("album_uri"),
    artistUri: text("artist_uri"),
    createdAt: timestamp("xata_createdat").defaultNow().notNull(),
    updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
    xataVersion: integer("xata_version"),
  },
  (t) => [
    index("tracks_catalog_recent_idx").on(t.createdAt.desc(), t.id),
    index("tracks_title_id_idx").on(t.title, t.id),
    index("tracks_duration_id_idx").on(t.duration, t.id),
    index("tracks_track_number_id_idx").on(t.trackNumber, t.id),
    index("tracks_disc_number_id_idx").on(t.discNumber, t.id),
    index("tracks_title_trgm_idx").using(
      "gin",
      sql`lower(${t.title}) gin_trgm_ops`,
    ),
    index("tracks_artist_trgm_idx").using(
      "gin",
      sql`lower(${t.artist}) gin_trgm_ops`,
    ),
    index("tracks_album_trgm_idx").using(
      "gin",
      sql`lower(${t.album}) gin_trgm_ops`,
    ),
    index("tracks_artist_id_idx").on(t.artist, t.id),
    index("tracks_genre_idx").on(t.genre),
    index("tracks_artist_uri_idx").on(t.artistUri),
    index("tracks_album_idx").on(t.album),
    index("tracks_album_artist_idx").on(t.albumArtist),
    index("tracks_isrc_idx").on(t.isrc),
    index("idx_tracks_lower_title").on(sql`lower(${t.title})`),
    index("idx_tracks_lower_mb_id").on(sql`lower(${t.mbId})`),
    index("idx_tracks_normalized_isrc").on(
      sql`upper(replace(${t.isrc}, '-', ''))`,
    ),
  ],
);

export type SelectTrack = InferSelectModel<typeof tracks>;
export type InsertTrack = InferInsertModel<typeof tracks>;

export default tracks;
