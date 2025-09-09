/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from "@atproto/lexicon";
import { lexicons } from "../../../../lexicons";
import { isObj, hasProp } from "../../../../util";
import { CID } from "multiformats/cid";
import type * as AppRockskySongDefsSongViewBasic from "../song/defs/songViewBasic";

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
  tracks?: AppRockskySongDefsSongViewBasic.Main[];
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
