/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { validate as _validate } from "../../../../lexicons.ts";
import { is$typed as _is$typed } from "../../../../util.ts";
import type * as AppRockskySongDefs from "../song/defs.ts";

const is$typed = _is$typed, validate = _validate;
const id = "app.rocksky.playlist.defs";

/** Detailed view of a playlist, including its tracks and metadata */
export interface PlaylistViewDetailed {
  $type?: "app.rocksky.playlist.defs#playlistViewDetailed";
  /** The unique identifier of the playlist. */
  id?: string;
  /** The title of the playlist. */
  title?: string;
  /** The URI of the playlist. */
  uri?: string;
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
  coverImageUrl?: string;
  /** The date and time when the playlist was created. */
  createdAt?: string;
  /** A list of tracks in the playlist. */
  tracks?: (AppRockskySongDefs.SongViewBasic)[];
}

const hashPlaylistViewDetailed = "playlistViewDetailed";

export function isPlaylistViewDetailed<V>(v: V) {
  return is$typed(v, id, hashPlaylistViewDetailed);
}

export function validatePlaylistViewDetailed<V>(v: V) {
  return validate<PlaylistViewDetailed & V>(v, id, hashPlaylistViewDetailed);
}

/** Basic view of a playlist, including its metadata */
export interface PlaylistViewBasic {
  $type?: "app.rocksky.playlist.defs#playlistViewBasic";
  /** The unique identifier of the playlist. */
  id?: string;
  /** The title of the playlist. */
  title?: string;
  /** The URI of the playlist. */
  uri?: string;
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
  coverImageUrl?: string;
  /** The date and time when the playlist was created. */
  createdAt?: string;
  /** The number of tracks in the playlist. */
  trackCount?: number;
}

const hashPlaylistViewBasic = "playlistViewBasic";

export function isPlaylistViewBasic<V>(v: V) {
  return is$typed(v, id, hashPlaylistViewBasic);
}

export function validatePlaylistViewBasic<V>(v: V) {
  return validate<PlaylistViewBasic & V>(v, id, hashPlaylistViewBasic);
}
