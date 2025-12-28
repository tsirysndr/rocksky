/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { validate as _validate } from "../../../../lexicons.ts";
import { is$typed as _is$typed } from "../../../../util.ts";

const is$typed = _is$typed, validate = _validate;
const id = "app.rocksky.song.defs";

export interface SongViewBasic {
  $type?: "app.rocksky.song.defs#songViewBasic";
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
  /** The timestamp when the song was created. */
  createdAt?: string;
}

const hashSongViewBasic = "songViewBasic";

export function isSongViewBasic<V>(v: V) {
  return is$typed(v, id, hashSongViewBasic);
}

export function validateSongViewBasic<V>(v: V) {
  return validate<SongViewBasic & V>(v, id, hashSongViewBasic);
}

export interface SongViewDetailed {
  $type?: "app.rocksky.song.defs#songViewDetailed";
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
  /** The timestamp when the song was created. */
  createdAt?: string;
}

const hashSongViewDetailed = "songViewDetailed";

export function isSongViewDetailed<V>(v: V) {
  return is$typed(v, id, hashSongViewDetailed);
}

export function validateSongViewDetailed<V>(v: V) {
  return validate<SongViewDetailed & V>(v, id, hashSongViewDetailed);
}
