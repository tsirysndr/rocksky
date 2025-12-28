/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { validate as _validate } from "../../../../lexicons.ts";
import { type $Typed, is$typed as _is$typed } from "../../../../util.ts";
import type * as AppRockskySongDefs from "../song/defs.ts";
import type * as AppRockskyAlbumDefs from "../album/defs.ts";
import type * as AppRockskyArtistDefs from "../artist/defs.ts";
import type * as AppRockskyPlaylistDefs from "../playlist/defs.ts";
import type * as AppRockskyActorDefs from "../actor/defs.ts";

const is$typed = _is$typed, validate = _validate;
const id = "app.rocksky.feed.defs";

export interface SearchResultsView {
  $type?: "app.rocksky.feed.defs#searchResultsView";
  hits?: (
    | $Typed<AppRockskySongDefs.SongViewBasic>
    | $Typed<AppRockskyAlbumDefs.AlbumViewBasic>
    | $Typed<AppRockskyArtistDefs.ArtistViewBasic>
    | $Typed<AppRockskyPlaylistDefs.PlaylistViewBasic>
    | $Typed<AppRockskyActorDefs.ProfileViewBasic>
    | { $type: string }
  )[];
  processingTimeMs?: number;
  limit?: number;
  offset?: number;
  estimatedTotalHits?: number;
}

const hashSearchResultsView = "searchResultsView";

export function isSearchResultsView<V>(v: V) {
  return is$typed(v, id, hashSearchResultsView);
}

export function validateSearchResultsView<V>(v: V) {
  return validate<SearchResultsView & V>(v, id, hashSearchResultsView);
}

export interface NowPlayingView {
  $type?: "app.rocksky.feed.defs#nowPlayingView";
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
}

const hashNowPlayingView = "nowPlayingView";

export function isNowPlayingView<V>(v: V) {
  return is$typed(v, id, hashNowPlayingView);
}

export function validateNowPlayingView<V>(v: V) {
  return validate<NowPlayingView & V>(v, id, hashNowPlayingView);
}

export interface NowPlayingsView {
  $type?: "app.rocksky.feed.defs#nowPlayingsView";
  nowPlayings?: (NowPlayingView)[];
}

const hashNowPlayingsView = "nowPlayingsView";

export function isNowPlayingsView<V>(v: V) {
  return is$typed(v, id, hashNowPlayingsView);
}

export function validateNowPlayingsView<V>(v: V) {
  return validate<NowPlayingsView & V>(v, id, hashNowPlayingsView);
}

export interface FeedGeneratorsView {
  $type?: "app.rocksky.feed.defs#feedGeneratorsView";
  feeds?: (FeedGeneratorView)[];
}

const hashFeedGeneratorsView = "feedGeneratorsView";

export function isFeedGeneratorsView<V>(v: V) {
  return is$typed(v, id, hashFeedGeneratorsView);
}

export function validateFeedGeneratorsView<V>(v: V) {
  return validate<FeedGeneratorsView & V>(v, id, hashFeedGeneratorsView);
}

export interface FeedGeneratorView {
  $type?: "app.rocksky.feed.defs#feedGeneratorView";
  id?: string;
  name?: string;
  description?: string;
  uri?: string;
  avatar?: string;
  creator?: AppRockskyActorDefs.ProfileViewBasic;
}

const hashFeedGeneratorView = "feedGeneratorView";

export function isFeedGeneratorView<V>(v: V) {
  return is$typed(v, id, hashFeedGeneratorView);
}

export function validateFeedGeneratorView<V>(v: V) {
  return validate<FeedGeneratorView & V>(v, id, hashFeedGeneratorView);
}

export interface FeedUriView {
  $type?: "app.rocksky.feed.defs#feedUriView";
  /** The feed URI. */
  uri?: string;
}

const hashFeedUriView = "feedUriView";

export function isFeedUriView<V>(v: V) {
  return is$typed(v, id, hashFeedUriView);
}

export function validateFeedUriView<V>(v: V) {
  return validate<FeedUriView & V>(v, id, hashFeedUriView);
}
