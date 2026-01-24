/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";

export interface ScrobbleViewBasic {
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
  liked?: boolean;
  likesCount?: number;
  [k: string]: unknown;
}

export function isScrobbleViewBasic(v: unknown): v is ScrobbleViewBasic {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.scrobble.defs#scrobbleViewBasic"
  );
}

export function validateScrobbleViewBasic(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.scrobble.defs#scrobbleViewBasic", v);
}

export interface ScrobbleViewDetailed {
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
  [k: string]: unknown;
}

export function isScrobbleViewDetailed(v: unknown): v is ScrobbleViewDetailed {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.scrobble.defs#scrobbleViewDetailed"
  );
}

export function validateScrobbleViewDetailed(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.scrobble.defs#scrobbleViewDetailed", v);
}
