/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { BlobRef, type ValidationResult } from "@atproto/lexicon";
import { CID } from "multiformats/cid";
import { lexicons } from "../../../../lexicons";
import { hasProp, isObj } from "../../../../util";

export interface SpotifyTrackView {
  /** The unique identifier of the Spotify track. */
  id?: string;
  /** The name of the track. */
  name?: string;
  /** The name of the artist. */
  artist?: string;
  /** The name of the album. */
  album?: string;
  /** The duration of the track in milliseconds. */
  duration?: number;
  /** A URL to a preview of the track. */
  previewUrl?: string;
  [k: string]: unknown;
}

export function isSpotifyTrackView(v: unknown): v is SpotifyTrackView {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.spotify.defs#spotifyTrackView"
  );
}

export function validateSpotifyTrackView(v: unknown): ValidationResult {
  return lexicons.validate("app.rocksky.spotify.defs#spotifyTrackView", v);
}
