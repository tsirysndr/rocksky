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
import type * as AppRockskyScrobbleDefs from "../scrobble/defs";

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

export interface StoryView {
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

export function isStoryView(v: unknown): v is StoryView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.feed.defs#storyView"
  );
}

export function validateStoryView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.feed.defs#storyView", v);
}

export interface StoriesView {
  stories?: StoryView[];
  [k: string]: unknown;
}

export function isStoriesView(v: unknown): v is StoriesView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.feed.defs#storiesView"
  );
}

export function validateStoriesView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.feed.defs#storiesView", v);
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

export interface FeedUriView {
  /** The feed URI. */
  uri?: string;
  [k: string]: unknown;
}

export function isFeedUriView(v: unknown): v is FeedUriView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.feed.defs#feedUriView"
  );
}

export function validateFeedUriView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.feed.defs#feedUriView", v);
}

export interface FeedItemView {
  scrobble?: AppRockskyScrobbleDefs.ScrobbleViewBasic;
  [k: string]: unknown;
}

export function isFeedItemView(v: unknown): v is FeedItemView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.feed.defs#feedItemView"
  );
}

export function validateFeedItemView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.feed.defs#feedItemView", v);
}

export interface FeedView {
  feed?: FeedItemView[];
  /** The pagination cursor for the next set of results. */
  cursor?: string;
  [k: string]: unknown;
}

export function isFeedView(v: unknown): v is FeedView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.feed.defs#feedView"
  );
}

export function validateFeedView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.feed.defs#feedView", v);
}

export interface RecommendationView {
  title?: string;
  artist?: string;
  album?: string;
  albumArt?: string;
  trackUri?: string;
  artistUri?: string;
  albumUri?: string;
  genres?: string[];
  recommendationScore?: number;
  /** neighbour | social | serendipity */
  source?: string;
  likesCount?: number;
  [k: string]: unknown;
}

export function isRecommendationView(v: unknown): v is RecommendationView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.feed.defs#recommendationView"
  );
}

export function validateRecommendationView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.feed.defs#recommendationView", v);
}

export interface RecommendationsView {
  recommendations?: RecommendationView[];
  cursor?: string;
  [k: string]: unknown;
}

export function isRecommendationsView(v: unknown): v is RecommendationsView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.feed.defs#recommendationsView"
  );
}

export function validateRecommendationsView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.feed.defs#recommendationsView", v);
}

export interface RecommendedArtistView {
  id?: string;
  uri?: string;
  name?: string;
  picture?: string;
  genres?: string[];
  recommendationScore?: number;
  /** neighbour | social | serendipity */
  source?: string;
  [k: string]: unknown;
}

export function isRecommendedArtistView(
  v: unknown,
): v is RecommendedArtistView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.feed.defs#recommendedArtistView"
  );
}

export function validateRecommendedArtistView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.feed.defs#recommendedArtistView", v);
}

export interface RecommendedArtistsView {
  artists?: RecommendedArtistView[];
  cursor?: string;
  [k: string]: unknown;
}

export function isRecommendedArtistsView(
  v: unknown,
): v is RecommendedArtistsView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.feed.defs#recommendedArtistsView"
  );
}

export function validateRecommendedArtistsView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.feed.defs#recommendedArtistsView", v);
}

export interface RecommendedAlbumView {
  id?: string;
  uri?: string;
  title?: string;
  artist?: string;
  artistUri?: string;
  year?: number;
  albumArt?: string;
  recommendationScore?: number;
  /** known-artist | new-artist | serendipity */
  source?: string;
  [k: string]: unknown;
}

export function isRecommendedAlbumView(v: unknown): v is RecommendedAlbumView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.feed.defs#recommendedAlbumView"
  );
}

export function validateRecommendedAlbumView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.feed.defs#recommendedAlbumView", v);
}

export interface RecommendedAlbumsView {
  albums?: RecommendedAlbumView[];
  cursor?: string;
  [k: string]: unknown;
}

export function isRecommendedAlbumsView(
  v: unknown,
): v is RecommendedAlbumsView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.feed.defs#recommendedAlbumsView"
  );
}

export function validateRecommendedAlbumsView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.feed.defs#recommendedAlbumsView", v);
}
