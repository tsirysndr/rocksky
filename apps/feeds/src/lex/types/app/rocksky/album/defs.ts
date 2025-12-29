/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { validate as _validate } from "../../../../lexicons.ts";
import { is$typed as _is$typed } from "../../../../util.ts";
import type * as AppRockskySongDefsSongViewBasic from "../song/defs/songViewBasic.ts";

const is$typed = _is$typed, validate = _validate;
const id = "app.rocksky.album.defs";

export interface AlbumViewBasic {
  $type?: "app.rocksky.album.defs#albumViewBasic";
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
}

const hashAlbumViewBasic = "albumViewBasic";

export function isAlbumViewBasic<V>(v: V) {
  return is$typed(v, id, hashAlbumViewBasic);
}

export function validateAlbumViewBasic<V>(v: V) {
  return validate<AlbumViewBasic & V>(v, id, hashAlbumViewBasic);
}

export interface AlbumViewDetailed {
  $type?: "app.rocksky.album.defs#albumViewDetailed";
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
  tracks?: (AppRockskySongDefsSongViewBasic.Main)[];
}

const hashAlbumViewDetailed = "albumViewDetailed";

export function isAlbumViewDetailed<V>(v: V) {
  return is$typed(v, id, hashAlbumViewDetailed);
}

export function validateAlbumViewDetailed<V>(v: V) {
  return validate<AlbumViewDetailed & V>(v, id, hashAlbumViewDetailed);
}
