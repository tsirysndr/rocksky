/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { validate as _validate } from "../../../../lexicons.ts";
import { is$typed as _is$typed } from "../../../../util.ts";

const is$typed = _is$typed, validate = _validate;
const id = "app.rocksky.spotify.defs";

export interface SpotifyTrackView {
  $type?: "app.rocksky.spotify.defs#spotifyTrackView";
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
}

const hashSpotifyTrackView = "spotifyTrackView";

export function isSpotifyTrackView<V>(v: V) {
  return is$typed(v, id, hashSpotifyTrackView);
}

export function validateSpotifyTrackView<V>(v: V) {
  return validate<SpotifyTrackView & V>(v, id, hashSpotifyTrackView);
}
