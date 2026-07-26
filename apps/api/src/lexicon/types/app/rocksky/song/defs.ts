/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";
import type * as AppRockskyArtistDefs from "../artist/defs";

export interface SongViewBasic {
  /** The unique identifier of the song. */
  id?: string;
  /** The title of the song. */
  title?: string;
  /** The artist of the song. */
  artist?: string;
  /** The artist of the album the song belongs to. */
  albumArtist?: string;
  /** The URL of the album art image. */
  albumArt?: string;
  /** The URI of the song. */
  uri?: string;
  /** The album of the song. */
  album?: string;
  /** The duration of the song in milliseconds. */
  duration?: number;
  /** The track number of the song in the album. */
  trackNumber?: number;
  /** The disc number of the song in the album. */
  discNumber?: number;
  /** The number of times the song has been played. */
  playCount?: number;
  /** The number of unique listeners who have played the song. */
  uniqueListeners?: number;
  /** The URI of the album the song belongs to. */
  albumUri?: string;
  /** The URI of the artist of the song. */
  artistUri?: string;
  /** The SHA256 hash of the song. */
  sha256?: string;
  /** The MusicBrainz ID of the song. */
  mbid?: string;
  /** The International Standard Recording Code (ISRC) of the song. */
  isrc?: string;
  tags?: string[];
  /** The timestamp when the song was created. */
  createdAt?: string;
  [k: string]: unknown;
}

export function isSongViewBasic(v: unknown): v is SongViewBasic {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.song.defs#songViewBasic"
  );
}

export function validateSongViewBasic(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.song.defs#songViewBasic", v);
}

export interface SongViewDetailed {
  /** The unique identifier of the song. */
  id?: string;
  /** The title of the song. */
  title?: string;
  /** The artist of the song. */
  artist?: string;
  /** The artist of the album the song belongs to. */
  albumArtist?: string;
  /** The URL of the album art image. */
  albumArt?: string;
  /** The URI of the song. */
  uri?: string;
  /** The album of the song. */
  album?: string;
  /** The duration of the song in milliseconds. */
  duration?: number;
  /** The track number of the song in the album. */
  trackNumber?: number;
  /** The disc number of the song in the album. */
  discNumber?: number;
  /** The number of times the song has been played. */
  playCount?: number;
  /** The number of unique listeners who have played the song. */
  uniqueListeners?: number;
  /** The URI of the album the song belongs to. */
  albumUri?: string;
  /** The URI of the artist of the song. */
  artistUri?: string;
  /** The SHA256 hash of the song. */
  sha256?: string;
  /** The MusicBrainz ID of the song. */
  mbid?: string;
  /** The International Standard Recording Code (ISRC) of the song. */
  isrc?: string;
  tags?: string[];
  /** The timestamp when the song was created. */
  createdAt?: string;
  artists?: AppRockskyArtistDefs.ArtistViewBasic[];
  firstScrobble?: FirstScrobbleView;
  /** Ranked list of candidate matches from external metadata providers (e.g. Deezer). Additive field returned by matchSong; may be empty. */
  matches?: SongMatchView[];
  [k: string]: unknown;
}

export function isSongViewDetailed(v: unknown): v is SongViewDetailed {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.song.defs#songViewDetailed"
  );
}

export function validateSongViewDetailed(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.song.defs#songViewDetailed", v);
}

/** A ranked candidate match for a song from an external metadata provider. */
export interface SongMatchView {
  /** The provider's numeric identifier for the matched track. */
  id?: number;
  /** The title of the matched track. */
  title?: string;
  /** The artist of the matched track. */
  artist?: string;
  /** The album of the matched track. */
  album?: string;
  /** The URL of the matched track's album art image. */
  albumArt?: string;
  /** The International Standard Recording Code (ISRC) of the matched track. */
  isrc?: string;
  /** The duration of the matched track in milliseconds. */
  durationMs?: number;
  /** The track number of the matched track in its album. */
  trackNumber?: number;
  /** The disc number of the matched track in its album. */
  discNumber?: number;
  /** A URL to the matched track on the provider. */
  link?: string;
  /** A URL to a short audio preview of the matched track. */
  preview?: string;
  /** The provider's popularity rank for the matched track. */
  rank?: number;
  /** Whether the matched track has explicit lyrics. */
  explicit?: boolean;
  /** Match confidence score in the range 0-100 (higher is better). */
  score?: number;
  [k: string]: unknown;
}

export function isSongMatchView(v: unknown): v is SongMatchView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.song.defs#songMatchView"
  );
}

export function validateSongMatchView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.song.defs#songMatchView", v);
}

export interface RecentListenerView {
  /** The unique identifier of the listener. */
  id?: string;
  /** The DID of the listener. */
  did?: string;
  /** The handle of the listener. */
  handle?: string;
  /** The display name of the listener. */
  displayName?: string;
  /** The URL of the listener's avatar image. */
  avatar?: string;
  /** The timestamp of the listener's most recent scrobble of this song. */
  timestamp?: string;
  /** The URI of the listener's most recent scrobble of this song. */
  scrobbleUri?: string;
  [k: string]: unknown;
}

export function isRecentListenerView(v: unknown): v is RecentListenerView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.song.defs#recentListenerView"
  );
}

export function validateRecentListenerView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.song.defs#recentListenerView", v);
}

export interface FirstScrobbleView {
  /** The handle of the user who first scrobbled this song. */
  handle?: string;
  /** The avatar URL of the user who first scrobbled this song. */
  avatar?: string;
  /** The timestamp of the first scrobble. */
  timestamp?: string;
  [k: string]: unknown;
}

export function isFirstScrobbleView(v: unknown): v is FirstScrobbleView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.song.defs#firstScrobbleView"
  );
}

export function validateFirstScrobbleView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.song.defs#firstScrobbleView", v);
}
