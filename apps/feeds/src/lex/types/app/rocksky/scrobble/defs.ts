/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { validate as _validate } from "../../../../lexicons.ts";
import { is$typed as _is$typed } from "../../../../util.ts";

const is$typed = _is$typed, validate = _validate;
const id = "app.rocksky.scrobble.defs";

export interface ScrobbleViewBasic {
  $type?: "app.rocksky.scrobble.defs#scrobbleViewBasic";
  /** The unique identifier of the scrobble. */
  id?: string;
  /** The handle of the user who created the scrobble. */
  user?: string;
  /** The display name of the user who created the scrobble. */
  userDisplayName?: string;
  /** The avatar URL of the user who created the scrobble. */
  userAvatar?: string;
  /** The title of the scrobble. */
  title?: string;
  /** The artist of the song. */
  artist?: string;
  /** The URI of the artist. */
  artistUri?: string;
  /** The album of the song. */
  album?: string;
  /** The URI of the album. */
  albumUri?: string;
  /** The album art URL of the song. */
  cover?: string;
  /** The timestamp when the scrobble was created. */
  date?: string;
  /** The URI of the scrobble. */
  uri?: string;
  /** The SHA256 hash of the scrobble data. */
  sha256?: string;
}

const hashScrobbleViewBasic = "scrobbleViewBasic";

export function isScrobbleViewBasic<V>(v: V) {
  return is$typed(v, id, hashScrobbleViewBasic);
}

export function validateScrobbleViewBasic<V>(v: V) {
  return validate<ScrobbleViewBasic & V>(v, id, hashScrobbleViewBasic);
}

export interface ScrobbleViewDetailed {
  $type?: "app.rocksky.scrobble.defs#scrobbleViewDetailed";
  /** The unique identifier of the scrobble. */
  id?: string;
  /** The handle of the user who created the scrobble. */
  user?: string;
  /** The title of the scrobble. */
  title?: string;
  /** The artist of the song. */
  artist?: string;
  /** The URI of the artist. */
  artistUri?: string;
  /** The album of the song. */
  album?: string;
  /** The URI of the album. */
  albumUri?: string;
  /** The album art URL of the song. */
  cover?: string;
  /** The timestamp when the scrobble was created. */
  date?: string;
  /** The URI of the scrobble. */
  uri?: string;
  /** The SHA256 hash of the scrobble data. */
  sha256?: string;
  /** The number of listeners */
  listeners?: number;
  /** The number of scrobbles for this song */
  scrobbles?: number;
}

const hashScrobbleViewDetailed = "scrobbleViewDetailed";

export function isScrobbleViewDetailed<V>(v: V) {
  return is$typed(v, id, hashScrobbleViewDetailed);
}

export function validateScrobbleViewDetailed<V>(v: V) {
  return validate<ScrobbleViewDetailed & V>(v, id, hashScrobbleViewDetailed);
}
