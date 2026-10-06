/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";
import type * as AppRockskySongDefs from "../song/defs";

export interface AlbumViewBasic {
  /** The unique identifier of the album. */
  id?: string;
  /** The URI of the album. */
  uri?: string;
  /** The title of the album. */
  title?: string;
  /** The artist of the album. */
  artist?: string;
  /** The URI of the album's artist. */
  artistUri?: string;
  /** The year the album was released. */
  year?: number;
  /** The URL of the album art image. */
  albumArt?: string;
  /** The release date of the album. */
  releaseDate?: string;
  /** The SHA256 hash of the album. */
  sha256?: string;
  /** The number of times the album has been played. */
  playCount?: number;
  /** The number of unique listeners who have played the album. */
  uniqueListeners?: number;
  [k: string]: unknown;
}

export function isAlbumViewBasic(v: unknown): v is AlbumViewBasic {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.album.defs#albumViewBasic"
  );
}

export function validateAlbumViewBasic(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.album.defs#albumViewBasic", v);
}

export interface AlbumViewDetailed {
  /** The unique identifier of the album. */
  id?: string;
  /** The URI of the album. */
  uri?: string;
  /** The title of the album. */
  title?: string;
  /** The artist of the album. */
  artist?: string;
  /** The URI of the album's artist. */
  artistUri?: string;
  /** The year the album was released. */
  year?: number;
  /** The URL of the album art image. */
  albumArt?: string;
  /** The release date of the album. */
  releaseDate?: string;
  /** The SHA256 hash of the album. */
  sha256?: string;
  /** The number of times the album has been played. */
  playCount?: number;
  /** The number of unique listeners who have played the album. */
  uniqueListeners?: number;
  tags?: string[];
  tracks?: AppRockskySongDefs.SongViewBasic[];
  discogs?: DiscogsView;
  [k: string]: unknown;
}

export function isAlbumViewDetailed(v: unknown): v is AlbumViewDetailed {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.album.defs#albumViewDetailed"
  );
}

export function validateAlbumViewDetailed(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.album.defs#albumViewDetailed", v);
}

/** Release metadata matched on Discogs for this album. */
export interface DiscogsView {
  /** The Discogs release ID. */
  releaseId?: number;
  /** The Discogs master ID, shared by every edition of the release. */
  masterId?: number;
  /** The release title as Discogs spells it. */
  title?: string;
  /** The release artist as Discogs credits it. */
  artist?: string;
  /** The primary release image on Discogs. */
  albumArt?: string;
  /** The year this pressing was released. */
  year?: number;
  /** The year the release first came out, from its master. */
  originalYear?: number;
  /** The release date of this pressing. */
  releaseDate?: string;
  /** The country this pressing was released in. */
  country?: string;
  /** The record label. */
  label?: string;
  /** The label's catalog number for this pressing. */
  catalogNumber?: string;
  /** The barcode printed on this pressing. */
  barcode?: string;
  /** The physical or digital formats of this pressing. */
  formats?: string[];
  /** The Discogs genres of the release. */
  genres?: string[];
  /** The Discogs styles of the release. */
  styles?: string[];
  /** The release page on Discogs. */
  url?: string;
  /** Confidence of the match that produced this release, from 0 to 100. */
  score?: number;
  /** Performance and production credits for the release. */
  credits?: DiscogsCreditView[];
  [k: string]: unknown;
}

export function isDiscogsView(v: unknown): v is DiscogsView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.album.defs#discogsView"
  );
}

export function validateDiscogsView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.album.defs#discogsView", v);
}

/** One performance or production credit from Discogs. */
export interface DiscogsCreditView {
  /** The Discogs artist ID, when the credit is linked to one. */
  artistId?: number;
  /** The credited name. */
  name?: string;
  /** The role as Discogs words it, such as "Written-By" or "Mixed By, Engineer". */
  role?: string;
  /** The track positions the credit applies to, absent when it covers the whole release. */
  tracks?: string;
  [k: string]: unknown;
}

export function isDiscogsCreditView(v: unknown): v is DiscogsCreditView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.album.defs#discogsCreditView"
  );
}

export function validateDiscogsCreditView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.album.defs#discogsCreditView", v);
}
