/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";
import type * as AppRockskyActorDefs from "../actor/defs";
import type * as AppRockskyScrobbleDefs from "../scrobble/defs";

export interface SearchResultsView {
  hits?: SearchHit[];
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
  liked?: boolean;
  likesCount?: number;
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
  description?: string | null;
  uri?: string;
  avatar?: string | null;
  creator?: AppRockskyActorDefs.ProfileViewBasic;
  did?: string;
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
  /** Legacy empty-array error fallback; successful responses use feed. */
  scrobbles?: AppRockskyScrobbleDefs.ScrobbleViewBasic[];
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

export interface SearchFederation {
  indexUid?: string;
  [k: string]: unknown;
}

export function isSearchFederation(v: unknown): v is SearchFederation {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.feed.defs#searchFederation"
  );
}

export function validateSearchFederation(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.feed.defs#searchFederation", v);
}

export interface SearchHit {
  /** The unique identifier of the song. */
  id?: string;
  /** The title of the song. */
  title?: string;
  /** The artist of the song. */
  artist?: string;
  /** The artist of the album the song belongs to. */
  albumArtist?: string;
  /** The URL of the album art image. */
  albumArt?: string | null;
  /** The URI of the song. */
  uri?: string | null;
  /** The album of the song. */
  album?: string;
  /** The duration of the song in milliseconds. */
  duration?: number;
  /** The track number of the song in the album. */
  trackNumber?: number | null;
  /** The disc number of the song in the album. */
  discNumber?: number | null;
  /** The number of times the song has been played. */
  playCount?: number;
  /** The number of users who have loved this song. */
  likesCount?: number;
  /** Whether the authenticated user has loved this song. False when unauthenticated. */
  liked?: boolean;
  /** The number of unique listeners who have played the song. */
  uniqueListeners?: number;
  /** The URI of the album the song belongs to. */
  albumUri?: string | null;
  /** The URI of the artist of the song. */
  artistUri?: string | null;
  /** The SHA256 hash of the song. */
  sha256?: string;
  /** The MusicBrainz ID of the song. */
  mbid?: string;
  /** The International Standard Recording Code (ISRC) of the song. */
  isrc?: string | null;
  tags?: string[];
  /** The timestamp when the song was created. */
  createdAt?: string;
  updatedAt?: string;
  mbId?: string | null;
  youtubeLink?: string | null;
  spotifyLink?: string | null;
  appleMusicLink?: string | null;
  tidalLink?: string | null;
  lyrics?: string | null;
  composer?: string | null;
  genre?: string | null;
  label?: string | null;
  copyrightMessage?: string | null;
  key?: string | null;
  acoustidFingerprint?: string | null;
  xataVersion?: number | null;
  /** The year the album was released. */
  year?: number | null;
  /** The release date of the album. */
  releaseDate?: string | null;
  discogsReleaseId?: string | null;
  /** The name of the artist. */
  name?: string;
  /** The picture of the artist. */
  picture?: string | null;
  biography?: string | null;
  born?: string | null;
  bornIn?: string | null;
  died?: string | null;
  genres?: string[] | null;
  /** The DID of the curator of the playlist. */
  curatorDid?: string;
  /** The handle of the curator of the playlist. */
  curatorHandle?: string;
  /** The name of the curator of the playlist. */
  curatorName?: string;
  /** The URL of the avatar image of the curator. */
  curatorAvatarUrl?: string;
  /** A description of the playlist. */
  description?: string;
  /** The URL of the cover image for the playlist. */
  coverImageUrl?: string | null;
  /** The number of tracks in the playlist. */
  trackCount?: number;
  /** Album-art URLs of up to four of the playlist's tracks, for rendering a cover mosaic when the playlist has no picture of its own. */
  trackArts?: string[];
  curatorDId?: string;
  /** The DID of the actor. */
  did?: string;
  /** The handle of the actor. */
  handle?: string;
  /** The display name of the actor. */
  displayName?: string | null;
  /** The URL of the actor's avatar image. */
  avatar?: string | null;
  _federation?: SearchFederation;
  [k: string]: unknown;
}

export function isSearchHit(v: unknown): v is SearchHit {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.feed.defs#searchHit"
  );
}

export function validateSearchHit(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.feed.defs#searchHit", v);
}
