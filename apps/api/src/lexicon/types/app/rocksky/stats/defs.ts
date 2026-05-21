/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";

export interface StatsView {
  /** The total number of scrobbles. */
  scrobbles?: number;
  /** The total number of unique artists scrobbled. */
  artists?: number;
  /** The total number of tracks marked as loved. */
  lovedTracks?: number;
  /** The total number of unique albums scrobbled. */
  albums?: number;
  /** The total number of unique tracks scrobbled. */
  tracks?: number;
  [k: string]: unknown;
}

export function isStatsView(v: unknown): v is StatsView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.stats.defs#statsView"
  );
}

export function validateStatsView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.stats.defs#statsView", v);
}

export interface WrappedArtist {
  /** The unique identifier of the artist. */
  id?: string;
  /** The name of the artist. */
  name?: string;
  /** The picture URL of the artist. */
  picture?: string;
  /** The AT-URI of the artist. */
  uri?: string;
  /** Number of plays in the wrapped period. */
  playCount?: number;
  [k: string]: unknown;
}

export function isWrappedArtist(v: unknown): v is WrappedArtist {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.stats.defs#wrappedArtist"
  );
}

export function validateWrappedArtist(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.stats.defs#wrappedArtist", v);
}

export interface WrappedTrack {
  /** The unique identifier of the track. */
  id?: string;
  /** The title of the track. */
  title?: string;
  /** The artist of the track. */
  artist?: string;
  /** The album art URL. */
  albumArt?: string;
  /** The AT-URI of the track. */
  uri?: string;
  /** The AT-URI of the artist. */
  artistUri?: string;
  /** The AT-URI of the album. */
  albumUri?: string;
  /** Number of plays in the wrapped period. */
  playCount?: number;
  [k: string]: unknown;
}

export function isWrappedTrack(v: unknown): v is WrappedTrack {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.stats.defs#wrappedTrack"
  );
}

export function validateWrappedTrack(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.stats.defs#wrappedTrack", v);
}

export interface WrappedAlbum {
  /** The unique identifier of the album. */
  id?: string;
  /** The title of the album. */
  title?: string;
  /** The artist of the album. */
  artist?: string;
  /** The album art URL. */
  albumArt?: string;
  /** The AT-URI of the album. */
  uri?: string;
  /** Number of plays in the wrapped period. */
  playCount?: number;
  [k: string]: unknown;
}

export function isWrappedAlbum(v: unknown): v is WrappedAlbum {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.stats.defs#wrappedAlbum"
  );
}

export function validateWrappedAlbum(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.stats.defs#wrappedAlbum", v);
}

export interface WrappedGenreCount {
  /** The genre name. */
  genre?: string;
  /** Number of scrobbles for this genre. */
  count?: number;
  [k: string]: unknown;
}

export function isWrappedGenreCount(v: unknown): v is WrappedGenreCount {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.stats.defs#wrappedGenreCount"
  );
}

export function validateWrappedGenreCount(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.stats.defs#wrappedGenreCount", v);
}

export interface WrappedMonthCount {
  /** Month number (1-12). */
  month?: number;
  /** Number of scrobbles in this month. */
  count?: number;
  [k: string]: unknown;
}

export function isWrappedMonthCount(v: unknown): v is WrappedMonthCount {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.stats.defs#wrappedMonthCount"
  );
}

export function validateWrappedMonthCount(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.stats.defs#wrappedMonthCount", v);
}

export interface WrappedDayCount {
  /** The date (YYYY-MM-DD). */
  date?: string;
  /** Number of scrobbles on this day. */
  count?: number;
  [k: string]: unknown;
}

export function isWrappedDayCount(v: unknown): v is WrappedDayCount {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.stats.defs#wrappedDayCount"
  );
}

export function validateWrappedDayCount(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.stats.defs#wrappedDayCount", v);
}

export interface WrappedMilestone {
  /** The title of the track. */
  trackTitle?: string;
  /** The name of the artist. */
  artistName?: string;
  /** The timestamp of the scrobble. */
  timestamp?: string;
  [k: string]: unknown;
}

export function isWrappedMilestone(v: unknown): v is WrappedMilestone {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.stats.defs#wrappedMilestone"
  );
}

export function validateWrappedMilestone(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.stats.defs#wrappedMilestone", v);
}

export interface WrappedView {
  /** The year of the wrapped stats. */
  year?: number;
  /** Total scrobbles in the year. */
  totalScrobbles?: number;
  /** Total listening time in minutes. */
  totalListeningTimeMinutes?: number;
  /** Top 5 artists by play count. */
  topArtists?: WrappedArtist[];
  /** Top 5 tracks by play count. */
  topTracks?: WrappedTrack[];
  /** Top 5 albums by play count. */
  topAlbums?: WrappedAlbum[];
  /** Top genres by play count. */
  topGenres?: WrappedGenreCount[];
  /** Scrobble counts per month. */
  scrobblesPerMonth?: WrappedMonthCount[];
  mostActiveDay?: WrappedDayCount;
  /** The most active hour of the day (0-23). */
  mostActiveHour?: number;
  /** Number of artists heard for the first time this year. */
  newArtistsCount?: number;
  /** Longest consecutive days streak. */
  longestStreak?: number;
  firstScrobble?: WrappedMilestone;
  lastScrobble?: WrappedMilestone;
  [k: string]: unknown;
}

export function isWrappedView(v: unknown): v is WrappedView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.stats.defs#wrappedView"
  );
}

export function validateWrappedView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.stats.defs#wrappedView", v);
}
