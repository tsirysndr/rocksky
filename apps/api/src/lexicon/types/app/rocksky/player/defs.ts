/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { BlobRef, type ValidationResult } from "@atproto/lexicon";
import { CID } from "multiformats/cid";
import { lexicons } from "../../../../lexicons";
import { hasProp, isObj } from "../../../../util";
import type * as AppRockskySongDefs from "../song/defs";

export interface CurrentlyPlayingViewDetailed {
  /** The title of the currently playing track */
  title?: string;
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
