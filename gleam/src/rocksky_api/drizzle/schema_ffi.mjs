// ../apps/api/src/schema/access-tokens.ts
import { sql as sql2 } from "drizzle-orm";
import { index, pgTable as pgTable2, text as text2, timestamp as timestamp2 } from "drizzle-orm/pg-core";

// ../apps/api/src/schema/users.ts
import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp
} from "drizzle-orm/pg-core";
var users = pgTable("users", {
  id: text("xata_id").primaryKey().default(sql`xata_id()`),
  did: text("did").unique().notNull(),
  displayName: text("display_name"),
  handle: text("handle").unique().notNull(),
  avatar: text("avatar").notNull(),
  isBot: boolean("is_bot").notNull().default(false),
  botFlaggedAt: timestamp("bot_flagged_at", { withTimezone: true }),
  botReason: text("bot_reason"),
  createdAt: timestamp("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer("xata_version")
});
var users_default = users;

// ../apps/api/src/schema/access-tokens.ts
var accessTokens = pgTable2("access_tokens", {
  id: text2("xata_id").primaryKey().default(sql2`xata_id()`),
  userId: text2("user_id").notNull().references(() => users_default.id),
  name: text2("name").notNull(),
  jti: text2("jti").notNull().unique(),
  tokenEncrypted: text2("token_encrypted").notNull(),
  lastFour: text2("last_four").notNull(),
  lastUsedAt: timestamp2("last_used_at"),
  createdAt: timestamp2("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp2("xata_updatedat").defaultNow().notNull()
}, (t) => [index("access_tokens_user_id_idx").on(t.userId)]);
var access_tokens_default = accessTokens;

// ../apps/api/src/schema/album-tracks.ts
import { sql as sql6 } from "drizzle-orm";
import {
  index as index5,
  integer as integer5,
  pgTable as pgTable6,
  text as text6,
  timestamp as timestamp6,
  unique
} from "drizzle-orm/pg-core";

// ../apps/api/src/schema/albums.ts
import { sql as sql4 } from "drizzle-orm";
import { index as index3, integer as integer3, pgTable as pgTable4, text as text4, timestamp as timestamp4 } from "drizzle-orm/pg-core";

// ../apps/api/src/schema/discogs-releases.ts
import { sql as sql3 } from "drizzle-orm";
import {
  index as index2,
  integer as integer2,
  pgTable as pgTable3,
  real,
  text as text3,
  timestamp as timestamp3
} from "drizzle-orm/pg-core";
var discogsReleases = pgTable3("discogs_releases", {
  id: text3("xata_id").primaryKey().default(sql3`xata_id()`),
  discogsId: integer2("discogs_id").notNull().unique(),
  masterId: integer2("master_id"),
  title: text3("title").notNull(),
  artist: text3("artist").notNull(),
  albumArt: text3("album_art"),
  year: integer2("year"),
  originalYear: integer2("original_year"),
  releaseDate: text3("release_date"),
  country: text3("country"),
  label: text3("label"),
  catalogNumber: text3("catalog_number"),
  barcode: text3("barcode"),
  formats: text3("formats").array(),
  genres: text3("genres").array(),
  styles: text3("styles").array(),
  discogsUrl: text3("discogs_url"),
  score: real("score"),
  creditsFetchedAt: timestamp3("credits_fetched_at"),
  createdAt: timestamp3("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp3("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer2("xata_version")
}, (t) => [
  index2("discogs_releases_master_id_idx").on(t.masterId),
  index2("discogs_releases_artist_title_idx").on(t.artist, t.title)
]);
var discogs_releases_default = discogsReleases;

// ../apps/api/src/schema/albums.ts
var albums = pgTable4("albums", {
  id: text4("xata_id").primaryKey().default(sql4`xata_id()`),
  title: text4("title").notNull(),
  artist: text4("artist").notNull(),
  releaseDate: text4("release_date"),
  year: integer3("year"),
  albumArt: text4("album_art"),
  uri: text4("uri").unique(),
  artistUri: text4("artist_uri"),
  appleMusicLink: text4("apple_music_link").unique(),
  spotifyLink: text4("spotify_link").unique(),
  tidalLink: text4("tidal_link").unique(),
  youtubeLink: text4("youtube_link").unique(),
  sha256: text4("sha256").unique().notNull(),
  discogsReleaseId: text4("discogs_release_id").references(() => discogs_releases_default.id),
  createdAt: timestamp4("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp4("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer3("xata_version")
}, (t) => [
  index3("albums_catalog_recent_idx").on(t.createdAt.desc(), t.id),
  index3("albums_title_id_idx").on(t.title, t.id),
  index3("albums_artist_trgm_idx").using("gin", sql4`lower(${t.artist}) gin_trgm_ops`),
  index3("albums_artist_id_idx").on(t.artist, t.id),
  index3("albums_year_id_idx").on(t.year, t.id),
  index3("albums_missing_artist_uri_idx").on(t.artist).where(sql4`${t.artistUri} IS NULL`)
]);
var albums_default = albums;

// ../apps/api/src/schema/tracks.ts
import { sql as sql5 } from "drizzle-orm";
import {
  index as index4,
  integer as integer4,
  pgTable as pgTable5,
  real as real2,
  text as text5,
  timestamp as timestamp5
} from "drizzle-orm/pg-core";
var tracks = pgTable5("tracks", {
  id: text5("xata_id").primaryKey().default(sql5`xata_id()`),
  title: text5("title").notNull(),
  artist: text5("artist").notNull(),
  albumArtist: text5("album_artist").notNull(),
  albumArt: text5("album_art"),
  album: text5("album").notNull(),
  trackNumber: integer4("track_number"),
  duration: integer4("duration").notNull(),
  mbId: text5("mb_id"),
  isrc: text5("isrc"),
  youtubeLink: text5("youtube_link").unique(),
  spotifyLink: text5("spotify_link").unique(),
  appleMusicLink: text5("apple_music_link").unique(),
  tidalLink: text5("tidal_link").unique(),
  sha256: text5("sha256").unique().notNull(),
  discNumber: integer4("disc_number"),
  lyrics: text5("lyrics"),
  composer: text5("composer"),
  genre: text5("genre"),
  label: text5("label"),
  copyrightMessage: text5("copyright_message"),
  key: text5("key"),
  bpm: real2("bpm"),
  acoustidFingerprint: text5("acoustid_fingerprint"),
  uri: text5("uri").unique(),
  albumUri: text5("album_uri"),
  artistUri: text5("artist_uri"),
  createdAt: timestamp5("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp5("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer4("xata_version")
}, (t) => [
  index4("tracks_catalog_recent_idx").on(t.createdAt.desc(), t.id),
  index4("tracks_title_id_idx").on(t.title, t.id),
  index4("tracks_duration_id_idx").on(t.duration, t.id),
  index4("tracks_track_number_id_idx").on(t.trackNumber, t.id),
  index4("tracks_disc_number_id_idx").on(t.discNumber, t.id),
  index4("tracks_title_trgm_idx").using("gin", sql5`lower(${t.title}) gin_trgm_ops`),
  index4("tracks_artist_trgm_idx").using("gin", sql5`lower(${t.artist}) gin_trgm_ops`),
  index4("tracks_album_trgm_idx").using("gin", sql5`lower(${t.album}) gin_trgm_ops`),
  index4("tracks_artist_id_idx").on(t.artist, t.id),
  index4("tracks_genre_idx").on(t.genre),
  index4("tracks_artist_uri_idx").on(t.artistUri),
  index4("tracks_album_idx").on(t.album),
  index4("tracks_album_artist_idx").on(t.albumArtist),
  index4("tracks_isrc_idx").on(t.isrc),
  index4("idx_tracks_lower_title").on(sql5`lower(${t.title})`),
  index4("idx_tracks_lower_mb_id").on(sql5`lower(${t.mbId})`),
  index4("idx_tracks_normalized_isrc").on(sql5`upper(replace(${t.isrc}, '-', ''))`)
]);
var tracks_default = tracks;

// ../apps/api/src/schema/album-tracks.ts
var albumTracks = pgTable6("album_tracks", {
  id: text6("xata_id").primaryKey().default(sql6`xata_id()`),
  albumId: text6("album_id").notNull().references(() => albums_default.id),
  trackId: text6("track_id").notNull().references(() => tracks_default.id),
  createdAt: timestamp6("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp6("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer5("xata_version")
}, (t) => [
  index5("album_tracks_album_id_idx").on(t.albumId),
  index5("album_tracks_track_id_idx").on(t.trackId),
  unique("album_tracks_album_id_track_id_unique").on(t.albumId, t.trackId)
]);
var album_tracks_default = albumTracks;

// ../apps/api/src/schema/api-keys.ts
import { sql as sql7 } from "drizzle-orm";
import { boolean as boolean2, pgTable as pgTable7, text as text7, timestamp as timestamp7 } from "drizzle-orm/pg-core";
var apiKeys = pgTable7("api_keys", {
  id: text7("xata_id").primaryKey().default(sql7`xata_id()`),
  name: text7("name").notNull(),
  apiKey: text7("api_key").notNull(),
  sharedSecret: text7("shared_secret").notNull(),
  description: text7("description"),
  enabled: boolean2("enabled").default(true).notNull(),
  userId: text7("user_id").notNull().references(() => users_default.id),
  createdAt: timestamp7("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp7("xata_updatedat").defaultNow().notNull()
});
var api_keys_default = apiKeys;

// ../apps/api/src/schema/import-jobs.ts
import { sql as sql8 } from "drizzle-orm";
import { index as index6, integer as integer6, pgTable as pgTable8, text as text8, timestamp as timestamp8 } from "drizzle-orm/pg-core";
var importJobs = pgTable8("import_jobs", {
  id: text8("xata_id").primaryKey().default(sql8`xata_id()`),
  userId: text8("user_id").references(() => users_default.id),
  type: text8("type").notNull(),
  status: text8("status").notNull().default("pending"),
  total: integer6("total").default(0),
  processed: integer6("processed").default(0),
  failed: integer6("failed").default(0),
  errors: text8("errors"),
  createdAt: timestamp8("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp8("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer6("xata_version")
}, (t) => [
  index6("import_jobs_user_id_idx").on(t.userId),
  index6("import_jobs_status_idx").on(t.status)
]);
var import_jobs_default = importJobs;

// ../apps/api/src/schema/artist-albums.ts
import { sql as sql10 } from "drizzle-orm";
import {
  index as index8,
  integer as integer8,
  pgTable as pgTable10,
  text as text10,
  timestamp as timestamp10,
  unique as unique2
} from "drizzle-orm/pg-core";

// ../apps/api/src/schema/artists.ts
import { sql as sql9 } from "drizzle-orm";
import { index as index7, integer as integer7, pgTable as pgTable9, text as text9, timestamp as timestamp9 } from "drizzle-orm/pg-core";
var artists = pgTable9("artists", {
  id: text9("xata_id").primaryKey().default(sql9`xata_id()`),
  name: text9("name").notNull(),
  biography: text9("biography"),
  born: timestamp9("born"),
  bornIn: text9("born_in"),
  died: timestamp9("died"),
  picture: text9("picture"),
  sha256: text9("sha256").unique().notNull(),
  uri: text9("uri").unique(),
  appleMusicLink: text9("apple_music_link"),
  spotifyLink: text9("spotify_link"),
  tidalLink: text9("tidal_link"),
  youtubeLink: text9("youtube_link"),
  genres: text9("genres").array(),
  createdAt: timestamp9("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp9("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer7("xata_version")
}, (t) => [index7("artists_catalog_recent_idx").on(t.createdAt.desc(), t.id)]);
var artists_default = artists;

// ../apps/api/src/schema/artist-albums.ts
var artistAlbums = pgTable10("artist_albums", {
  id: text10("xata_id").primaryKey().default(sql10`xata_id()`),
  artistId: text10("artist_id").notNull().references(() => artists_default.id),
  albumId: text10("album_id").notNull().references(() => albums_default.id),
  createdAt: timestamp10("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp10("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer8("xata_version")
}, (t) => [
  index8("artist_albums_artist_id_idx").on(t.artistId),
  index8("artist_albums_album_id_idx").on(t.albumId),
  unique2("artist_albums_artist_id_album_id_unique").on(t.artistId, t.albumId)
]);
var artist_albums_default = artistAlbums;

// ../apps/api/src/schema/artist-tracks.ts
import { sql as sql11 } from "drizzle-orm";
import {
  index as index9,
  integer as integer9,
  pgTable as pgTable11,
  text as text11,
  timestamp as timestamp11,
  unique as unique3
} from "drizzle-orm/pg-core";
var artistTracks = pgTable11("artist_tracks", {
  id: text11("xata_id").primaryKey().default(sql11`xata_id()`),
  artistId: text11("artist_id").notNull().references(() => artists_default.id),
  trackId: text11("track_id").notNull().references(() => tracks_default.id),
  createdAt: timestamp11("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp11("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer9("xata_version")
}, (t) => [
  index9("artist_tracks_artist_id_idx").on(t.artistId),
  index9("artist_tracks_track_id_idx").on(t.trackId),
  unique3("artist_tracks_artist_id_track_id_unique").on(t.artistId, t.trackId)
]);
var artist_tracks_default = artistTracks;

// ../apps/api/src/schema/discogs-credits.ts
import { sql as sql12 } from "drizzle-orm";
import {
  index as index10,
  integer as integer10,
  pgTable as pgTable12,
  text as text12,
  timestamp as timestamp12,
  unique as unique4
} from "drizzle-orm/pg-core";
var discogsCredits = pgTable12("discogs_credits", {
  id: text12("xata_id").primaryKey().default(sql12`xata_id()`),
  releaseId: text12("release_id").notNull().references(() => discogs_releases_default.id),
  artistId: integer10("artist_id"),
  name: text12("name").notNull(),
  role: text12("role"),
  tracks: text12("tracks"),
  position: integer10("position").notNull(),
  createdAt: timestamp12("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp12("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer10("xata_version")
}, (t) => [
  index10("discogs_credits_release_id_idx").on(t.releaseId),
  index10("discogs_credits_artist_id_idx").on(t.artistId),
  unique4("discogs_credits_release_id_position_unique").on(t.releaseId, t.position)
]);
var discogs_credits_default = discogsCredits;

// ../apps/api/src/schema/discogs-identifiers.ts
import { sql as sql13 } from "drizzle-orm";
import {
  index as index11,
  integer as integer11,
  pgTable as pgTable13,
  text as text13,
  timestamp as timestamp13,
  unique as unique5
} from "drizzle-orm/pg-core";
var discogsIdentifiers = pgTable13("discogs_identifiers", {
  id: text13("xata_id").primaryKey().default(sql13`xata_id()`),
  releaseId: text13("release_id").notNull().references(() => discogs_releases_default.id),
  type: text13("type").notNull(),
  value: text13("value"),
  description: text13("description"),
  position: integer11("position").notNull(),
  createdAt: timestamp13("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp13("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer11("xata_version")
}, (t) => [
  index11("discogs_identifiers_release_id_idx").on(t.releaseId),
  index11("discogs_identifiers_type_value_idx").on(t.type, t.value),
  unique5("discogs_identifiers_release_id_position_unique").on(t.releaseId, t.position)
]);
var discogs_identifiers_default = discogsIdentifiers;

// ../apps/api/src/schema/discogs-masters.ts
import { sql as sql14 } from "drizzle-orm";
import { integer as integer12, pgTable as pgTable14, text as text14, timestamp as timestamp14 } from "drizzle-orm/pg-core";
var discogsMasters = pgTable14("discogs_masters", {
  id: text14("xata_id").primaryKey().default(sql14`xata_id()`),
  discogsId: integer12("discogs_id").notNull().unique(),
  title: text14("title").notNull(),
  artist: text14("artist"),
  year: integer12("year"),
  mainReleaseId: integer12("main_release_id"),
  discogsUrl: text14("discogs_url"),
  genres: text14("genres").array(),
  styles: text14("styles").array(),
  createdAt: timestamp14("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp14("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer12("xata_version")
});
var discogs_masters_default = discogsMasters;

// ../apps/api/src/schema/discogs-release-artists.ts
import { sql as sql15 } from "drizzle-orm";
import {
  index as index12,
  integer as integer13,
  pgTable as pgTable15,
  text as text15,
  timestamp as timestamp15,
  unique as unique6
} from "drizzle-orm/pg-core";
var discogsReleaseArtists = pgTable15("discogs_release_artists", {
  id: text15("xata_id").primaryKey().default(sql15`xata_id()`),
  releaseId: text15("release_id").notNull().references(() => discogs_releases_default.id),
  artistId: integer13("artist_id"),
  name: text15("name").notNull(),
  anv: text15("anv"),
  joinPhrase: text15("join_phrase"),
  role: text15("role"),
  position: integer13("position").notNull(),
  createdAt: timestamp15("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp15("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer13("xata_version")
}, (t) => [
  index12("discogs_release_artists_release_id_idx").on(t.releaseId),
  index12("discogs_release_artists_artist_id_idx").on(t.artistId),
  unique6("discogs_release_artists_release_id_position_unique").on(t.releaseId, t.position)
]);
var discogs_release_artists_default = discogsReleaseArtists;

// ../apps/api/src/schema/discogs-release-labels.ts
import { sql as sql16 } from "drizzle-orm";
import {
  index as index13,
  integer as integer14,
  pgTable as pgTable16,
  text as text16,
  timestamp as timestamp16,
  unique as unique7
} from "drizzle-orm/pg-core";
var discogsReleaseLabels = pgTable16("discogs_release_labels", {
  id: text16("xata_id").primaryKey().default(sql16`xata_id()`),
  releaseId: text16("release_id").notNull().references(() => discogs_releases_default.id),
  labelId: integer14("label_id"),
  name: text16("name").notNull(),
  catalogNumber: text16("catalog_number"),
  kind: text16("kind").notNull(),
  entityType: text16("entity_type"),
  position: integer14("position").notNull(),
  createdAt: timestamp16("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp16("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer14("xata_version")
}, (t) => [
  index13("discogs_release_labels_release_id_idx").on(t.releaseId),
  index13("discogs_release_labels_label_id_idx").on(t.labelId),
  unique7("discogs_release_labels_release_id_kind_position_unique").on(t.releaseId, t.kind, t.position)
]);
var discogs_release_labels_default = discogsReleaseLabels;

// ../apps/api/src/schema/discogs-searches.ts
import { sql as sql17 } from "drizzle-orm";
import {
  index as index14,
  integer as integer15,
  pgTable as pgTable17,
  real as real3,
  text as text17,
  timestamp as timestamp17
} from "drizzle-orm/pg-core";
var discogsSearches = pgTable17("discogs_searches", {
  id: text17("xata_id").primaryKey().default(sql17`xata_id()`),
  sha256: text17("sha256").unique().notNull(),
  artist: text17("artist").notNull(),
  album: text17("album").notNull(),
  releaseId: text17("release_id").references(() => discogs_releases_default.id),
  score: real3("score"),
  searchedAt: timestamp17("searched_at").defaultNow().notNull(),
  createdAt: timestamp17("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp17("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer15("xata_version")
}, (t) => [index14("discogs_searches_release_id_idx").on(t.releaseId)]);
var discogs_searches_default = discogsSearches;

// ../apps/api/src/schema/discogs-tracks.ts
import { sql as sql18 } from "drizzle-orm";
import {
  index as index15,
  integer as integer16,
  pgTable as pgTable18,
  text as text18,
  timestamp as timestamp18,
  unique as unique8
} from "drizzle-orm/pg-core";
var discogsTracks = pgTable18("discogs_tracks", {
  id: text18("xata_id").primaryKey().default(sql18`xata_id()`),
  releaseId: text18("release_id").notNull().references(() => discogs_releases_default.id),
  position: text18("position"),
  type: text18("type"),
  title: text18("title").notNull(),
  duration: text18("duration"),
  durationMs: integer16("duration_ms"),
  discNumber: integer16("disc_number"),
  trackNumber: integer16("track_number"),
  idx: integer16("idx").notNull(),
  createdAt: timestamp18("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp18("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer16("xata_version")
}, (t) => [
  index15("discogs_tracks_release_id_idx").on(t.releaseId),
  unique8("discogs_tracks_release_id_idx_unique").on(t.releaseId, t.idx)
]);
var discogs_tracks_default = discogsTracks;

// ../apps/api/src/schema/dropbox.ts
import { sql as sql20 } from "drizzle-orm";
import { pgTable as pgTable20, text as text20, timestamp as timestamp20 } from "drizzle-orm/pg-core";

// ../apps/api/src/schema/dropbox-tokens.ts
import { sql as sql19 } from "drizzle-orm";
import { pgTable as pgTable19, text as text19, timestamp as timestamp19 } from "drizzle-orm/pg-core";
var dropboxTokens = pgTable19("dropbox_tokens", {
  id: text19("xata_id").primaryKey().default(sql19`xata_id()`),
  refreshToken: text19("refresh_token").notNull(),
  createdAt: timestamp19("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp19("xata_updatedat").defaultNow().notNull()
});
var dropbox_tokens_default = dropboxTokens;

// ../apps/api/src/schema/dropbox.ts
var dropbox = pgTable20("dropbox", {
  id: text20("xata_id").primaryKey().default(sql20`xata_id()`),
  userId: text20("user_id").notNull().references(() => users_default.id),
  dropboxTokenId: text20("dropbox_token_id").notNull().references(() => dropbox_tokens_default.id),
  xataVersion: text20("xata_version"),
  createdAt: timestamp20("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp20("xata_updatedat").defaultNow().notNull()
});
var dropbox_default = dropbox;

// ../apps/api/src/schema/event-artists.ts
import { sql as sql22 } from "drizzle-orm";
import {
  index as index17,
  integer as integer18,
  pgTable as pgTable22,
  text as text22,
  timestamp as timestamp22,
  uniqueIndex
} from "drizzle-orm/pg-core";

// ../apps/api/src/schema/events.ts
import { sql as sql21 } from "drizzle-orm";
import {
  index as index16,
  integer as integer17,
  jsonb,
  pgTable as pgTable21,
  text as text21,
  timestamp as timestamp21
} from "drizzle-orm/pg-core";
var events = pgTable21("events", {
  id: text21("xata_id").primaryKey().default(sql21`xata_id()`),
  uri: text21("uri").unique().notNull(),
  cid: text21("cid"),
  musicUri: text21("music_uri").unique().notNull(),
  musicCid: text21("music_cid"),
  name: text21("name").notNull(),
  description: text21("description"),
  startsAt: timestamp21("starts_at", { withTimezone: true }),
  endsAt: timestamp21("ends_at", { withTimezone: true }),
  mode: text21("mode"),
  status: text21("status"),
  locations: jsonb("locations").$type(),
  uris: jsonb("uris").$type(),
  media: jsonb("media").$type(),
  kind: text21("kind"),
  genre: text21("genre"),
  tags: text21("tags").array(),
  externalIds: jsonb("external_ids").$type(),
  ticketsUrl: text21("tickets_url"),
  imageUrl: text21("image_url"),
  createdBy: text21("created_by").notNull().references(() => users_default.id),
  sha256: text21("sha256"),
  duplicateOf: text21("duplicate_of").references(() => events.id, {
    onDelete: "set null"
  }),
  createdAt: timestamp21("created_at", { withTimezone: true }),
  xataCreatedAt: timestamp21("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp21("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer17("xata_version")
}, (table) => [
  index16("events_starts_at_idx").on(table.startsAt),
  index16("events_created_by_idx").on(table.createdBy),
  index16("events_sha256_idx").on(table.sha256),
  index16("events_duplicate_of_idx").on(table.duplicateOf)
]);
var events_default = events;

// ../apps/api/src/schema/event-artists.ts
var eventArtists = pgTable22("event_artists", {
  id: text22("xata_id").primaryKey().default(sql22`xata_id()`),
  eventId: text22("event_id").notNull().references(() => events_default.id, { onDelete: "cascade" }),
  artistId: text22("artist_id").notNull().references(() => artists_default.id),
  name: text22("name").notNull(),
  role: text22("role"),
  stage: text22("stage"),
  mbid: text22("mbid"),
  startsAt: timestamp22("starts_at", { withTimezone: true }),
  position: integer18("position").notNull().default(0),
  createdAt: timestamp22("xata_createdat").defaultNow().notNull()
}, (table) => [
  uniqueIndex("event_artists_event_artist_idx").on(table.eventId, table.artistId),
  index17("event_artists_artist_id_idx").on(table.artistId)
]);
var event_artists_default = eventArtists;

// ../apps/api/src/schema/event-rsvps.ts
import { sql as sql23 } from "drizzle-orm";
import {
  index as index18,
  pgTable as pgTable23,
  text as text23,
  timestamp as timestamp23,
  uniqueIndex as uniqueIndex2
} from "drizzle-orm/pg-core";
var eventRsvps = pgTable23("event_rsvps", {
  id: text23("xata_id").primaryKey().default(sql23`xata_id()`),
  eventId: text23("event_id").notNull().references(() => events_default.id, { onDelete: "cascade" }),
  userId: text23("user_id").notNull().references(() => users_default.id),
  uri: text23("uri").unique().notNull(),
  cid: text23("cid"),
  status: text23("status").notNull(),
  createdAt: timestamp23("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp23("xata_updatedat").defaultNow().notNull()
}, (table) => [
  uniqueIndex2("event_rsvps_event_user_idx").on(table.eventId, table.userId),
  index18("event_rsvps_user_id_idx").on(table.userId)
]);
var event_rsvps_default = eventRsvps;

// ../apps/api/src/schema/dropbox-accounts.ts
import { sql as sql24 } from "drizzle-orm";
import { boolean as boolean3, pgTable as pgTable24, text as text24, timestamp as timestamp24 } from "drizzle-orm/pg-core";
var dropboxAccounts = pgTable24("dropbox_accounts", {
  id: text24("xata_id").primaryKey().default(sql24`xata_id()`),
  email: text24("email").unique().notNull(),
  isBetaUser: boolean3("is_beta_user").default(false).notNull(),
  userId: text24("user_id").notNull().references(() => users_default.id),
  xataVersion: text24("xata_version"),
  createdAt: timestamp24("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp24("xata_updatedat").defaultNow().notNull()
});
var dropbox_accounts_default = dropboxAccounts;

// ../apps/api/src/schema/dropbox-directories.ts
import { sql as sql25 } from "drizzle-orm";
import { pgTable as pgTable25, text as text25, timestamp as timestamp25 } from "drizzle-orm/pg-core";
var dropboxDirectories = pgTable25("dropbox_directories", {
  id: text25("xata_id").primaryKey().default(sql25`xata_id()`),
  name: text25("name").notNull(),
  path: text25("path").notNull(),
  parentId: text25("parent_id").references(() => dropboxDirectories.id),
  dropboxId: text25("dropbox_id").notNull(),
  fileId: text25("file_id").notNull().unique(),
  xataVersion: text25("xata_version"),
  createdAt: timestamp25("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp25("xata_updatedat").defaultNow().notNull()
});
var dropbox_directories_default = dropboxDirectories;

// ../apps/api/src/schema/dropbox-paths.ts
import { sql as sql26 } from "drizzle-orm";
import { pgTable as pgTable26, text as text26, timestamp as timestamp26 } from "drizzle-orm/pg-core";
var dropboxPaths = pgTable26("dropbox_paths", {
  id: text26("xata_id").primaryKey().default(sql26`xata_id()`),
  path: text26("path").notNull(),
  name: text26("name").notNull(),
  dropboxId: text26("dropbox_id").notNull(),
  trackId: text26("track_id").notNull(),
  directoryId: text26("directory_id").references(() => dropbox_directories_default.id),
  fileId: text26("file_id").notNull().unique(),
  xataVersion: text26("xata_version"),
  createdAt: timestamp26("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp26("xata_updatedat").defaultNow().notNull()
});
var dropbox_paths_default = dropboxPaths;

// ../apps/api/src/schema/feeds.ts
import { sql as sql27 } from "drizzle-orm";
import { integer as integer19, pgTable as pgTable27, text as text27, timestamp as timestamp27 } from "drizzle-orm/pg-core";
var feeds = pgTable27("feeds", {
  id: text27("xata_id").primaryKey().default(sql27`xata_id()`),
  displayName: text27("display_name").notNull(),
  description: text27("description"),
  did: text27("did").notNull(),
  uri: text27("uri").notNull().unique(),
  avatar: text27("avatar"),
  userId: text27("user_id").notNull().references(() => users_default.id),
  xataVersion: integer19("xata_version"),
  createdAt: timestamp27("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp27("xata_updatedat").defaultNow().notNull()
});
var feeds_default = feeds;

// ../apps/api/src/schema/follows.ts
import { sql as sql28 } from "drizzle-orm";
import {
  integer as integer20,
  pgTable as pgTable28,
  text as text28,
  timestamp as timestamp28,
  uniqueIndex as uniqueIndex3
} from "drizzle-orm/pg-core";
var follows = pgTable28("follows", {
  id: text28("xata_id").primaryKey().default(sql28`xata_id()`),
  uri: text28("uri").notNull().unique(),
  follower_did: text28("follower_did").notNull(),
  subject_did: text28("subject_did").notNull(),
  xataVersion: integer20("xata_version"),
  createdAt: timestamp28("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp28("xata_updatedat").defaultNow().notNull()
}, (t) => [
  uniqueIndex3("follows_follower_subject_unique").on(t.follower_did, t.subject_did)
]);
var follows_default = follows;

// ../apps/api/src/schema/google-drive-accounts.ts
import { sql as sql29 } from "drizzle-orm";
import { boolean as boolean4, pgTable as pgTable29, text as text29, timestamp as timestamp29 } from "drizzle-orm/pg-core";
var googleDriveAccounts = pgTable29("google_drive_accounts", {
  id: text29("xata_id").primaryKey().default(sql29`xata_id()`),
  email: text29("email").unique().notNull(),
  isBetaUser: boolean4("is_beta_user").default(false).notNull(),
  userId: text29("user_id").notNull().references(() => users_default.id),
  xataVersion: text29("xata_version"),
  createdAt: timestamp29("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp29("xata_updatedat").defaultNow().notNull()
});
var google_drive_accounts_default = googleDriveAccounts;

// ../apps/api/src/schema/google-drive-directories.ts
import { sql as sql30 } from "drizzle-orm";
import { pgTable as pgTable30, text as text30, timestamp as timestamp30 } from "drizzle-orm/pg-core";
var googleDriveDirectories = pgTable30("google_drive_directories", {
  id: text30("xata_id").primaryKey().default(sql30`xata_id()`),
  name: text30("name").notNull(),
  path: text30("path").notNull(),
  parentId: text30("parent_id").references(() => googleDriveDirectories.id),
  googleDriveId: text30("google_drive_id").notNull(),
  fileId: text30("file_id").notNull().unique(),
  xataVersion: text30("xata_version"),
  createdAt: timestamp30("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp30("xata_updatedat").defaultNow().notNull()
});
var google_drive_directories_default = googleDriveDirectories;

// ../apps/api/src/schema/google-drive-paths.ts
import { sql as sql31 } from "drizzle-orm";
import { pgTable as pgTable31, text as text31, timestamp as timestamp31 } from "drizzle-orm/pg-core";
var googleDrivePaths = pgTable31("google_drive_paths", {
  id: text31("xata_id").primaryKey().default(sql31`xata_id()`),
  googleDriveId: text31("google_drive_id").notNull(),
  trackId: text31("track_id").notNull(),
  name: text31("name").notNull(),
  directoryId: text31("directory_id").references(() => google_drive_directories_default.id),
  fileId: text31("file_id").notNull().unique(),
  xataVersion: text31("xata_version"),
  createdAt: timestamp31("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp31("xata_updatedat").defaultNow().notNull()
});
var google_drive_paths_default = googleDrivePaths;

// ../apps/api/src/schema/googledrive.ts
import { sql as sql33 } from "drizzle-orm";
import { pgTable as pgTable33, text as text33, timestamp as timestamp33 } from "drizzle-orm/pg-core";

// ../apps/api/src/schema/google-drive-tokens.ts
import { sql as sql32 } from "drizzle-orm";
import { pgTable as pgTable32, text as text32, timestamp as timestamp32 } from "drizzle-orm/pg-core";
var googleDriveTokens = pgTable32("google_drive_tokens", {
  id: text32("xata_id").primaryKey().default(sql32`xata_id()`),
  refreshToken: text32("refresh_token").notNull(),
  createdAt: timestamp32("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp32("xata_updatedat").defaultNow().notNull()
});
var google_drive_tokens_default = googleDriveTokens;

// ../apps/api/src/schema/googledrive.ts
var googleDrive = pgTable33("google_drive", {
  id: text33("xata_id").primaryKey().default(sql33`xata_id()`),
  googleDriveTokenId: text33("google_drive_token_id").notNull().references(() => google_drive_tokens_default.id),
  userId: text33("user_id").notNull().references(() => users_default.id),
  xataVersion: text33("xata_version"),
  createdAt: timestamp33("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp33("xata_updatedat").defaultNow().notNull()
});
var googledrive_default = googleDrive;

// ../apps/api/src/schema/loved-tracks.ts
import { sql as sql34 } from "drizzle-orm";
import { index as index19, pgTable as pgTable34, text as text34, timestamp as timestamp34 } from "drizzle-orm/pg-core";
var lovedTracks = pgTable34("loved_tracks", {
  id: text34("xata_id").primaryKey().default(sql34`xata_id()`),
  userId: text34("user_id").notNull().references(() => users_default.id),
  trackId: text34("track_id").notNull().references(() => tracks_default.id),
  uri: text34("uri").unique(),
  createdAt: timestamp34("xata_createdat").defaultNow().notNull()
}, (t) => [
  index19("loved_tracks_track_id_idx").on(t.trackId),
  index19("loved_tracks_user_id_idx").on(t.userId)
]);
var loved_tracks_default = lovedTracks;

// ../apps/api/src/schema/mirror-sources.ts
import { sql as sql35 } from "drizzle-orm";
import {
  boolean as boolean5,
  index as index20,
  integer as integer21,
  pgTable as pgTable35,
  text as text35,
  timestamp as timestamp35,
  uniqueIndex as uniqueIndex4
} from "drizzle-orm/pg-core";
var mirrorSources = pgTable35("mirror_sources", {
  id: text35("xata_id").primaryKey().default(sql35`xata_id()`),
  userId: text35("user_id").notNull().references(() => users_default.id),
  provider: text35("provider").notNull(),
  enabled: boolean5("enabled").notNull().default(false),
  pushEnabled: boolean5("push_enabled"),
  externalUsername: text35("external_username"),
  encryptedApiKey: text35("encrypted_api_key"),
  lastPolledAt: timestamp35("last_polled_at"),
  lastScrobbleSeenAt: timestamp35("last_scrobble_seen_at"),
  createdAt: timestamp35("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp35("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer21("xata_version")
}, (t) => [
  uniqueIndex4("mirror_sources_user_provider_idx").on(t.userId, t.provider),
  index20("mirror_sources_enabled_provider_idx").on(t.enabled, t.provider)
]);
var mirror_sources_default = mirrorSources;

// ../apps/api/src/schema/navidrome-playlist-tracks.ts
import { sql as sql37 } from "drizzle-orm";
import { pgTable as pgTable37, text as text37, timestamp as timestamp37 } from "drizzle-orm/pg-core";

// ../apps/api/src/schema/navidrome-playlists.ts
import { sql as sql36 } from "drizzle-orm";
import { pgTable as pgTable36, text as text36, timestamp as timestamp36 } from "drizzle-orm/pg-core";
var navidromePlaylists = pgTable36("navidrome_playlists", {
  id: text36("xata_id").primaryKey().default(sql36`xata_id()`),
  name: text36("name").notNull(),
  description: text36("description"),
  uri: text36("uri").unique(),
  userId: text36("user_id").notNull().references(() => users_default.id),
  createdAt: timestamp36("xata_createdat", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp36("xata_updatedat", { withTimezone: true }).defaultNow().notNull()
});
var navidrome_playlists_default = navidromePlaylists;

// ../apps/api/src/schema/navidrome-playlist-tracks.ts
var navidromePlaylistTracks = pgTable37("navidrome_playlist_tracks", {
  id: text37("xata_id").primaryKey().default(sql37`xata_id()`),
  playlistId: text37("playlist_id").notNull().references(() => navidrome_playlists_default.id),
  trackId: text37("track_id").notNull().references(() => tracks_default.id),
  createdAt: timestamp37("xata_createdat", { withTimezone: true }).defaultNow().notNull()
});
var navidrome_playlist_tracks_default = navidromePlaylistTracks;

// ../apps/api/src/schema/notifications.ts
import { sql as sql40 } from "drizzle-orm";
import { boolean as boolean6, index as index22, pgTable as pgTable40, text as text40, timestamp as timestamp40 } from "drizzle-orm/pg-core";

// ../apps/api/src/schema/shouts.ts
import { sql as sql39 } from "drizzle-orm";
import { integer as integer23, jsonb as jsonb2, pgTable as pgTable39, text as text39, timestamp as timestamp39 } from "drizzle-orm/pg-core";

// ../apps/api/src/schema/scrobbles.ts
import { sql as sql38 } from "drizzle-orm";
import {
  index as index21,
  integer as integer22,
  pgTable as pgTable38,
  text as text38,
  timestamp as timestamp38,
  unique as unique9
} from "drizzle-orm/pg-core";
var scrobbles = pgTable38("scrobbles", {
  id: text38("xata_id").primaryKey().default(sql38`xata_id()`),
  userId: text38("user_id").references(() => users_default.id),
  trackId: text38("track_id").references(() => tracks_default.id),
  albumId: text38("album_id").references(() => albums_default.id),
  artistId: text38("artist_id").references(() => artists_default.id),
  uri: text38("uri").unique(),
  createdAt: timestamp38("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp38("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer22("xata_version"),
  timestamp: timestamp38("timestamp").defaultNow().notNull()
}, (t) => [
  index21("scrobbles_user_id_timestamp_idx").on(t.userId, t.timestamp),
  index21("scrobbles_wrapped_idx").on(t.userId, t.timestamp, t.artistId, t.albumId, t.trackId),
  index21("scrobbles_artist_id_idx").on(t.artistId),
  index21("scrobbles_album_id_idx").on(t.albumId),
  index21("scrobbles_track_id_idx").on(t.trackId),
  index21("scrobbles_timestamp_idx").on(t.timestamp),
  index21("scrobbles_chart_range_idx").on(t.timestamp, t.artistId, t.trackId, t.userId),
  index21("scrobbles_album_listeners_idx").on(t.albumId, t.timestamp, t.userId),
  index21("scrobbles_artist_id_timestamp_idx").on(t.artistId, t.timestamp.desc()),
  index21("scrobbles_artist_track_user_idx").on(t.artistId, t.trackId, t.userId),
  index21("scrobbles_user_stats_idx").on(t.userId, t.artistId, t.albumId, t.trackId),
  unique9("scrobbles_user_track_timestamp_unique").on(t.userId, t.trackId, t.timestamp)
]);
var scrobbles_default = scrobbles;

// ../apps/api/src/schema/shouts.ts
var shouts = pgTable39("shouts", {
  id: text39("xata_id").primaryKey().default(sql39`xata_id()`),
  content: text39("content").notNull(),
  trackId: text39("track_id").references(() => tracks_default.id),
  artistId: text39("artist_id").references(() => users_default.id),
  albumId: text39("album_id").references(() => albums_default.id),
  scrobbleId: text39("scrobble_id").references(() => scrobbles_default.id),
  uri: text39("uri").unique().notNull(),
  authorId: text39("author_id").references(() => users_default.id).notNull(),
  parentId: text39("parent_id").references(() => shouts.id),
  gifUrl: text39("gif_url"),
  gifPreviewUrl: text39("gif_preview_url"),
  gifAlt: text39("gif_alt"),
  gifWidth: integer23("gif_width"),
  gifHeight: integer23("gif_height"),
  facets: jsonb2("facets").$type(),
  createdAt: timestamp39("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp39("xata_updatedat").defaultNow().notNull()
});
var shouts_default = shouts;

// ../apps/api/src/schema/notifications.ts
var notifications = pgTable40("notifications", {
  id: text40("xata_id").primaryKey().default(sql40`xata_id()`),
  userId: text40("user_id").notNull().references(() => users_default.id),
  actorId: text40("actor_id").notNull().references(() => users_default.id),
  type: text40("type").notNull(),
  shoutId: text40("shout_id").references(() => shouts_default.id),
  subjectUri: text40("subject_uri"),
  read: boolean6("read").notNull().default(false),
  readAt: timestamp40("read_at", { withTimezone: true }),
  createdAt: timestamp40("xata_createdat").defaultNow().notNull()
}, (t) => [
  index22("notifications_user_id_read_idx").on(t.userId, t.read),
  index22("notifications_user_id_createdat_idx").on(t.userId, t.createdAt)
]);
var notifications_default = notifications;

// ../apps/api/src/schema/playlist-tracks.ts
import { sql as sql42 } from "drizzle-orm";
import { index as index23, pgTable as pgTable42, text as text42, timestamp as timestamp42 } from "drizzle-orm/pg-core";

// ../apps/api/src/schema/playlists.ts
import { sql as sql41 } from "drizzle-orm";
import { pgTable as pgTable41, text as text41, timestamp as timestamp41 } from "drizzle-orm/pg-core";
var playlists = pgTable41("playlists", {
  id: text41("xata_id").primaryKey().default(sql41`xata_id()`),
  name: text41("name").notNull(),
  picture: text41("picture"),
  description: text41("description"),
  uri: text41("uri").unique(),
  cid: text41("cid"),
  collaborators: text41("collaborators").array(),
  spotifyLink: text41("spotify_link"),
  tidalLink: text41("tidal_link"),
  appleMusicLink: text41("apple_music_link"),
  createdBy: text41("created_by").notNull().references(() => users_default.id),
  createdAt: timestamp41("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp41("xata_updatedat").defaultNow().notNull()
});
var playlists_default = playlists;

// ../apps/api/src/schema/playlist-tracks.ts
var playlistTracks = pgTable42("playlist_tracks", {
  id: text42("xata_id").primaryKey().default(sql42`xata_id()`),
  playlistId: text42("playlist_id").notNull().references(() => playlists_default.id),
  trackId: text42("track_id").notNull().references(() => tracks_default.id),
  uri: text42("uri").unique(),
  cid: text42("cid"),
  addedBy: text42("added_by").references(() => users_default.id),
  addedAt: timestamp42("added_at", { withTimezone: true }),
  createdAt: timestamp42("xata_createdat").defaultNow().notNull()
}, (table) => [
  index23("playlist_tracks_track_playlist_idx").on(table.trackId, table.playlistId),
  index23("playlist_tracks_playlist_id_added_at_idx").on(table.playlistId, table.addedAt)
]);
var playlist_tracks_default = playlistTracks;

// ../apps/api/src/schema/profile-shouts.ts
import { sql as sql43 } from "drizzle-orm";
import { pgTable as pgTable43, text as text43, timestamp as timestamp43 } from "drizzle-orm/pg-core";
var profileShouts = pgTable43("profile_shouts", {
  id: text43("xata_id").primaryKey().default(sql43`xata_id()`),
  userId: text43("user_id").notNull().references(() => users_default.id),
  shoutId: text43("shout_id").notNull().references(() => shouts_default.id),
  createdAt: timestamp43("xata_createdat").defaultNow().notNull()
});
var profile_shouts_default = profileShouts;

// ../apps/api/src/schema/queue-tracks.ts
import { sql as sql44 } from "drizzle-orm";
import { integer as integer24, pgTable as pgTable44, text as text44, timestamp as timestamp44 } from "drizzle-orm/pg-core";
var queueTracks = pgTable44("queue_tracks", {
  id: text44("xata_id").primaryKey().default(sql44`xata_id()`),
  userId: text44("user_id").notNull().references(() => users_default.id),
  trackId: text44("track_id").notNull().references(() => tracks_default.id),
  position: integer24("position").notNull(),
  fileUri: text44("file_uri").notNull(),
  version: integer24("xata_version").default(0).notNull(),
  createdAt: timestamp44("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp44("xata_updatedat").defaultNow().notNull()
});
var queue_tracks_default = queueTracks;

// ../apps/api/src/schema/shout-likes.ts
import { sql as sql45 } from "drizzle-orm";
import { pgTable as pgTable45, text as text45, timestamp as timestamp45 } from "drizzle-orm/pg-core";
var shoutLikes = pgTable45("shout_likes", {
  id: text45("xata_id").primaryKey().default(sql45`xata_id()`),
  userId: text45("user_id").notNull().references(() => users_default.id),
  shoutId: text45("shout_id").notNull().references(() => shouts_default.id),
  createdAt: timestamp45("xata_createdat").defaultNow().notNull(),
  uri: text45("uri").unique().notNull()
});
var shout_likes_default = shoutLikes;

// ../apps/api/src/schema/shout-reports.ts
import { sql as sql46 } from "drizzle-orm";
import { pgTable as pgTable46, text as text46, timestamp as timestamp46 } from "drizzle-orm/pg-core";
var shoutReports = pgTable46("shout_reports", {
  id: text46("xata_id").primaryKey().default(sql46`xata_id()`),
  userId: text46("user_id").notNull().references(() => users_default.id),
  shoutId: text46("shout_id").notNull().references(() => shouts_default.id),
  createdAt: timestamp46("xata_createdat").defaultNow().notNull()
});
var shout_reports_default = shoutReports;

// ../apps/api/src/schema/spotify-accounts.ts
import { sql as sql47 } from "drizzle-orm";
import {
  boolean as boolean7,
  integer as integer25,
  pgTable as pgTable47,
  text as text47,
  timestamp as timestamp47
} from "drizzle-orm/pg-core";
var spotifyAccounts = pgTable47("spotify_accounts", {
  id: text47("xata_id").primaryKey().default(sql47`xata_id()`),
  xataVersion: integer25("xata_version"),
  email: text47("email").notNull(),
  userId: text47("user_id").notNull().references(() => users_default.id),
  isBetaUser: boolean7("is_beta_user").default(false).notNull(),
  spotifyAppId: text47("spotify_app_id"),
  createdAt: timestamp47("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp47("xata_updatedat").defaultNow().notNull()
});
var spotify_accounts_default = spotifyAccounts;

// ../apps/api/src/schema/spotify-apps.ts
import { sql as sql48 } from "drizzle-orm";
import { integer as integer26, pgTable as pgTable48, text as text48, timestamp as timestamp48 } from "drizzle-orm/pg-core";
var spotifyApps = pgTable48("spotify_apps", {
  id: text48("xata_id").primaryKey().default(sql48`xata_id()`),
  xataVersion: integer26("xata_version"),
  spotifyAppId: text48("spotify_app_id").unique().notNull(),
  spotifySecret: text48("spotify_secret").notNull(),
  createdAt: timestamp48("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp48("xata_updatedat").defaultNow().notNull()
});
var spotify_apps_default = spotifyApps;

// ../apps/api/src/schema/spotify-tokens.ts
import { sql as sql49 } from "drizzle-orm";
import { integer as integer27, pgTable as pgTable49, text as text49, timestamp as timestamp49 } from "drizzle-orm/pg-core";
var spotifyTokens = pgTable49("spotify_tokens", {
  id: text49("xata_id").primaryKey().default(sql49`xata_id()`),
  xataVersion: integer27("xata_version"),
  accessToken: text49("access_token").notNull(),
  refreshToken: text49("refresh_token").notNull(),
  userId: text49("user_id").notNull().references(() => users_default.id),
  spotifyAppId: text49("spotify_app_id").notNull(),
  createdAt: timestamp49("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp49("xata_updatedat").defaultNow().notNull()
});
var spotify_tokens_default = spotifyTokens;

// ../apps/api/src/schema/user-albums.ts
import { sql as sql50 } from "drizzle-orm";
import { index as index24, integer as integer28, pgTable as pgTable50, text as text50, timestamp as timestamp50 } from "drizzle-orm/pg-core";
var userAlbums = pgTable50("user_albums", {
  id: text50("xata_id").primaryKey().default(sql50`xata_id()`),
  userId: text50("user_id").notNull().references(() => users_default.id),
  albumId: text50("album_id").notNull().references(() => albums_default.id),
  createdAt: timestamp50("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp50("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer28("xata_version"),
  scrobbles: integer28("scrobbles"),
  uri: text50("uri").unique().notNull()
}, (t) => [index24("user_albums_user_id_idx").on(t.userId)]);
var user_albums_default = userAlbums;

// ../apps/api/src/schema/user-artists.ts
import { sql as sql51 } from "drizzle-orm";
import { index as index25, integer as integer29, pgTable as pgTable51, text as text51, timestamp as timestamp51 } from "drizzle-orm/pg-core";
var userArtists = pgTable51("user_artists", {
  id: text51("xata_id").primaryKey().default(sql51`xata_id()`),
  userId: text51("user_id").notNull().references(() => users_default.id),
  artistId: text51("artist_id").notNull().references(() => artists_default.id),
  createdAt: timestamp51("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp51("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer29("xata_version"),
  scrobbles: integer29("scrobbles"),
  uri: text51("uri").unique().notNull()
}, (t) => [
  index25("user_artists_user_id_idx").on(t.userId),
  index25("user_artists_artist_id_idx").on(t.artistId)
]);
var user_artists_default = userArtists;

// ../apps/api/src/schema/user-playlists.ts
import { sql as sql52 } from "drizzle-orm";
import { pgTable as pgTable52, text as text52, timestamp as timestamp52 } from "drizzle-orm/pg-core";
var userPlaylists = pgTable52("user_playlists", {
  id: text52("xata_id").primaryKey().default(sql52`xata_id()`),
  userId: text52("user_id").notNull().references(() => users_default.id),
  playlistId: text52("playlist_id").notNull().references(() => playlists_default.id),
  createdAt: timestamp52("xata_createdat").defaultNow().notNull(),
  uri: text52("uri").unique()
});
var user_playlists_default = userPlaylists;

// ../apps/api/src/schema/user-tracks.ts
import { sql as sql53 } from "drizzle-orm";
import { index as index26, integer as integer30, pgTable as pgTable53, text as text53, timestamp as timestamp53 } from "drizzle-orm/pg-core";
var userTracks = pgTable53("user_tracks", {
  id: text53("xata_id").primaryKey().default(sql53`xata_id()`),
  userId: text53("user_id").notNull().references(() => users_default.id),
  trackId: text53("track_id").notNull().references(() => tracks_default.id),
  createdAt: timestamp53("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp53("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer30("xata_version"),
  uri: text53("uri").unique().notNull(),
  scrobbles: integer30("scrobbles")
}, (t) => [index26("user_tracks_user_id_idx").on(t.userId)]);
var user_tracks_default = userTracks;

// ../apps/api/src/schema/user-storage-providers.ts
import { sql as sql54 } from "drizzle-orm";
import { index as index27, integer as integer31, pgTable as pgTable54, text as text54, timestamp as timestamp54 } from "drizzle-orm/pg-core";
var userStorageProviders = pgTable54("user_storage_providers", {
  id: text54("xata_id").primaryKey().default(sql54`xata_id()`),
  userId: text54("user_id").notNull().references(() => users_default.id),
  label: text54("label").notNull(),
  endpoint: text54("endpoint").notNull(),
  region: text54("region").notNull().default("auto"),
  bucket: text54("bucket").notNull(),
  accessKey: text54("access_key").notNull(),
  secretKey: text54("secret_key").notNull(),
  publicUrl: text54("public_url"),
  verifiedAt: timestamp54("verified_at"),
  createdAt: timestamp54("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp54("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer31("xata_version")
}, (t) => [index27("user_storage_providers_user_id_idx").on(t.userId)]);
var user_storage_providers_default = userStorageProviders;

// ../apps/api/src/schema/user-uploads.ts
import { sql as sql55 } from "drizzle-orm";
import { index as index28, integer as integer32, pgTable as pgTable55, text as text55, timestamp as timestamp55 } from "drizzle-orm/pg-core";
var userUploads = pgTable55("user_uploads", {
  id: text55("xata_id").primaryKey().default(sql55`xata_id()`),
  userId: text55("user_id").notNull().references(() => users_default.id),
  trackId: text55("track_id").notNull().references(() => tracks_default.id),
  r2Key: text55("r2_key").notNull(),
  mimeType: text55("mime_type").notNull(),
  fileSize: integer32("file_size").notNull(),
  originalFilename: text55("original_filename").notNull(),
  sampleRate: integer32("sample_rate"),
  storageProviderId: text55("storage_provider_id").references(() => user_storage_providers_default.id),
  uploadedAt: timestamp55("uploaded_at").defaultNow().notNull(),
  createdAt: timestamp55("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp55("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer32("xata_version")
}, (t) => [
  index28("user_uploads_user_id_idx").on(t.userId),
  index28("user_uploads_track_id_idx").on(t.trackId),
  index28("user_uploads_user_id_track_id_idx").on(t.userId, t.trackId)
]);
var user_uploads_default = userUploads;

// ../apps/api/src/schema/upload-queue-state.ts
import { sql as sql56 } from "drizzle-orm";
import { integer as integer33, pgTable as pgTable56, text as text56, timestamp as timestamp56 } from "drizzle-orm/pg-core";
var uploadQueueState = pgTable56("upload_queue_state", {
  id: text56("xata_id").primaryKey().default(sql56`xata_id()`),
  userId: text56("user_id").notNull().unique().references(() => users_default.id),
  uploadIds: text56("upload_ids").notNull().default("[]"),
  currentIndex: integer33("current_index").notNull().default(0),
  createdAt: timestamp56("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp56("xata_updatedat").defaultNow().notNull(),
  xataVersion: integer33("xata_version")
});
var upload_queue_state_default = uploadQueueState;

// ../apps/api/src/schema/webscrobblers.ts
import { sql as sql57 } from "drizzle-orm";
import { boolean as boolean8, pgTable as pgTable57, text as text57, timestamp as timestamp57 } from "drizzle-orm/pg-core";
var webscrobblers = pgTable57("webscrobblers", {
  id: text57("xata_id").primaryKey().default(sql57`xata_id()`),
  name: text57("name").notNull(),
  uuid: text57("uuid").notNull(),
  description: text57("description"),
  enabled: boolean8("enabled").default(true).notNull(),
  userId: text57("user_id").notNull().references(() => users_default.id),
  createdAt: timestamp57("xata_createdat").defaultNow().notNull(),
  updatedAt: timestamp57("xata_updatedat").defaultNow().notNull()
});
var webscrobblers_default = webscrobblers;

// ../apps/api/src/schema/index.ts
var schema_default = {
  importJobs: import_jobs_default,
  notifications: notifications_default,
  profileShouts: profile_shouts_default,
  shoutLikes: shout_likes_default,
  shouts: shouts_default,
  users: users_default,
  albums: albums_default,
  artists: artists_default,
  tracks: tracks_default,
  scrobbles: scrobbles_default,
  shoutReports: shout_reports_default,
  playlists: playlists_default,
  playlistTracks: playlist_tracks_default,
  navidromePlaylists: navidrome_playlists_default,
  navidromePlaylistTracks: navidrome_playlist_tracks_default,
  apiKeys: api_keys_default,
  accessTokens: access_tokens_default,
  webscrobblers: webscrobblers_default,
  userAlbums: user_albums_default,
  userArtists: user_artists_default,
  userTracks: user_tracks_default,
  userStorageProviders: user_storage_providers_default,
  userUploads: user_uploads_default,
  uploadQueueState: upload_queue_state_default,
  albumTracks: album_tracks_default,
  userPlaylists: user_playlists_default,
  lovedTracks: loved_tracks_default,
  spotifyAccounts: spotify_accounts_default,
  spotifyTokens: spotify_tokens_default,
  spotifyApps: spotify_apps_default,
  artistTracks: artist_tracks_default,
  artistAlbums: artist_albums_default,
  dropboxAccounts: dropbox_accounts_default,
  googleDriveAccounts: google_drive_accounts_default,
  dropboxDirectories: dropbox_directories_default,
  dropboxPaths: dropbox_paths_default,
  googleDriveDirectories: google_drive_directories_default,
  googleDrivePaths: google_drive_paths_default,
  dropbox: dropbox_default,
  dropboxTokens: dropbox_tokens_default,
  googleDrive: googledrive_default,
  queueTracks: queue_tracks_default,
  feeds: feeds_default,
  follows: follows_default,
  mirrorSources: mirror_sources_default,
  discogsReleases: discogs_releases_default,
  discogsSearches: discogs_searches_default,
  discogsCredits: discogs_credits_default,
  discogsMasters: discogs_masters_default,
  discogsReleaseArtists: discogs_release_artists_default,
  discogsReleaseLabels: discogs_release_labels_default,
  discogsIdentifiers: discogs_identifiers_default,
  discogsTracks: discogs_tracks_default,
  events: events_default,
  eventArtists: event_artists_default,
  eventRsvps: event_rsvps_default
};

// scripts/drizzle_schema_entry.ts
import { getTableName } from "drizzle-orm";
var completeSchema = { ...schema_default, googleDriveTokens: google_drive_tokens_default };
var tables = Object.fromEntries(Object.values(completeSchema).map((table) => [getTableName(table), table]));
export {
  tables
};
