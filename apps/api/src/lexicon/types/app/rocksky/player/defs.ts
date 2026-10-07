/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";
import * as AppRockskySongDefs from "../song/defs";

export interface CurrentlyPlayingViewDetailed {
  /** The title of the currently playing track */
  title?: string;
  device?: {};
  shuffle_state?: boolean;
  repeat_state?: string;
  timestamp?: number;
  context?: {} | null;
  progress_ms?: number | null;
  item?: {} | null;
  currently_playing_type?: string;
  actions?: {};
  is_playing?: boolean;
  uri?: string | null;
  albumUri?: string | null;
  artistUri?: string | null;
  liked?: boolean;
  [k: string]: unknown;
}

export function isCurrentlyPlayingViewDetailed(
  v: unknown,
): v is CurrentlyPlayingViewDetailed {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.player.defs#currentlyPlayingViewDetailed"
  );
}

export function validateCurrentlyPlayingViewDetailed(
  v: unknown,
): ValidationResult {
  return lexicons.validate(
    "app.rocksky.player.defs#currentlyPlayingViewDetailed",
    v,
  );
}

export interface PlaybackQueueViewDetailed {
  tracks?: AppRockskySongDefs.SongViewBasic[];
  [k: string]: unknown;
}

export function isPlaybackQueueViewDetailed(
  v: unknown,
): v is PlaybackQueueViewDetailed {
  return (
    isObj(v) &&
    hasProp(v, "$type") &&
    v.$type === "app.rocksky.player.defs#playbackQueueViewDetailed"
  );
}

export function validatePlaybackQueueViewDetailed(
  v: unknown,
): ValidationResult {
  return lexicons.validate(
    "app.rocksky.player.defs#playbackQueueViewDetailed",
    v,
  );
}
