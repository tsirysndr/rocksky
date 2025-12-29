/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { validate as _validate } from "../../../../lexicons.ts";
import { is$typed as _is$typed } from "../../../../util.ts";

const is$typed = _is$typed, validate = _validate;
const id = "app.rocksky.artist.defs";

export interface ArtistViewBasic {
  $type?: "app.rocksky.artist.defs#artistViewBasic";
  /** The unique identifier of the artist. */
  id?: string;
  /** The URI of the artist. */
  uri?: string;
  /** The name of the artist. */
  name?: string;
  /** The picture of the artist. */
  picture?: string;
  /** The SHA256 hash of the artist. */
  sha256?: string;
  /** The number of times the artist has been played. */
  playCount?: number;
  /** The number of unique listeners who have played the artist. */
  uniqueListeners?: number;
}

const hashArtistViewBasic = "artistViewBasic";

export function isArtistViewBasic<V>(v: V) {
  return is$typed(v, id, hashArtistViewBasic);
}

export function validateArtistViewBasic<V>(v: V) {
  return validate<ArtistViewBasic & V>(v, id, hashArtistViewBasic);
}

export interface ArtistViewDetailed {
  $type?: "app.rocksky.artist.defs#artistViewDetailed";
  /** The unique identifier of the artist. */
  id?: string;
  /** The URI of the artist. */
  uri?: string;
  /** The name of the artist. */
  name?: string;
  /** The picture of the artist. */
  picture?: string;
  /** The SHA256 hash of the artist. */
  sha256?: string;
  /** The number of times the artist has been played. */
  playCount?: number;
  /** The number of unique listeners who have played the artist. */
  uniqueListeners?: number;
}

const hashArtistViewDetailed = "artistViewDetailed";

export function isArtistViewDetailed<V>(v: V) {
  return is$typed(v, id, hashArtistViewDetailed);
}

export function validateArtistViewDetailed<V>(v: V) {
  return validate<ArtistViewDetailed & V>(v, id, hashArtistViewDetailed);
}

export interface SongViewBasic {
  $type?: "app.rocksky.artist.defs#songViewBasic";
  /** The URI of the song. */
  uri?: string;
  /** The title of the song. */
  title?: string;
  /** The number of times the song has been played. */
  playCount?: number;
}

const hashSongViewBasic = "songViewBasic";

export function isSongViewBasic<V>(v: V) {
  return is$typed(v, id, hashSongViewBasic);
}

export function validateSongViewBasic<V>(v: V) {
  return validate<SongViewBasic & V>(v, id, hashSongViewBasic);
}

export interface ListenerViewBasic {
  $type?: "app.rocksky.artist.defs#listenerViewBasic";
  /** The unique identifier of the actor. */
  id?: string;
  /** The DID of the listener. */
  did?: string;
  /** The handle of the listener. */
  handle?: string;
  /** The display name of the listener. */
  displayName?: string;
  /** The URL of the listener's avatar image. */
  avatar?: string;
  mostListenedSong?: SongViewBasic;
  /** The total number of plays by the listener. */
  totalPlays?: number;
  /** The rank of the listener among all listeners of the artist. */
  rank?: number;
}

const hashListenerViewBasic = "listenerViewBasic";

export function isListenerViewBasic<V>(v: V) {
  return is$typed(v, id, hashListenerViewBasic);
}

export function validateListenerViewBasic<V>(v: V) {
  return validate<ListenerViewBasic & V>(v, id, hashListenerViewBasic);
}

export interface ArtistMbid {
  $type?: "app.rocksky.artist.defs#artistMbid";
  /** The MusicBrainz Identifier (MBID) of the artist. */
  mbid?: string;
  /** The name of the artist. */
  name?: string;
}

const hashArtistMbid = "artistMbid";

export function isArtistMbid<V>(v: V) {
  return is$typed(v, id, hashArtistMbid);
}

export function validateArtistMbid<V>(v: V) {
  return validate<ArtistMbid & V>(v, id, hashArtistMbid);
}
