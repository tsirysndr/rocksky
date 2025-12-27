/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";
import type * as AppRockskySongDefs from "../song/defs";
import type * as AppRockskyAlbumDefs from "../album/defs";
import type * as AppRockskyArtistDefs from "../artist/defs";
import type * as AppRockskyPlaylistDefs from "../playlist/defs";
import type * as AppRockskyActorDefs from "../actor/defs";

export interface SearchResultsView {
  hits?: (
    | AppRockskySongDefs.SongViewBasic
    | AppRockskyAlbumDefs.AlbumViewBasic
    | AppRockskyArtistDefs.ArtistViewBasic
    | AppRockskyPlaylistDefs.PlaylistViewBasic
    | AppRockskyActorDefs.ProfileViewBasic
    | { $type: string; [k: string]: unknown }
  )[];
  processingTimeMs?: number;
  limit?: number;
  offset?: number;
  estimatedTotalHits?: number;
  [k: string]: unknown;
}

export function isSearchResultsView(v: unknown): v is SearchResultsView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.feed.defs#searchResultsView"
  );
}

export function validateSearchResultsView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.feed.defs#searchResultsView", v);
}

export interface NowPlayingView {
  album?: string;
  albumArt?: string;
  albumArtist?: string;
  albumUri?: string;
  artist?: string;
  artistUri?: string;
  avatar?: string;
  createdAt?: string;
  did?: string;
  handle?: string;
  id?: string;
  title?: string;
  trackId?: string;
  trackUri?: string;
  uri?: string;
  [k: string]: unknown;
}

export function isNowPlayingView(v: unknown): v is NowPlayingView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.feed.defs#nowPlayingView"
  );
}

export function validateNowPlayingView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.feed.defs#nowPlayingView", v);
}

export interface NowPlayingsView {
  nowPlayings?: NowPlayingView[];
  [k: string]: unknown;
}

export function isNowPlayingsView(v: unknown): v is NowPlayingsView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.feed.defs#nowPlayingsView"
  );
}

export function validateNowPlayingsView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.feed.defs#nowPlayingsView", v);
}

export interface FeedGeneratorsView {
  feeds?: FeedGeneratorView[];
  [k: string]: unknown;
}

export function isFeedGeneratorsView(v: unknown): v is FeedGeneratorsView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.feed.defs#feedGeneratorsView"
  );
}

export function validateFeedGeneratorsView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.feed.defs#feedGeneratorsView", v);
}

export interface FeedGeneratorView {
  id?: string;
  name?: string;
  description?: string;
  uri?: string;
  avatar?: string;
  creator?: AppRockskyActorDefs.ProfileViewBasic;
  [k: string]: unknown;
}

export function isFeedGeneratorView(v: unknown): v is FeedGeneratorView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.feed.defs#feedGeneratorView"
  );
}

export function validateFeedGeneratorView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.feed.defs#feedGeneratorView", v);
}
