/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { validate as _validate } from "../../../../lexicons.ts";
import { is$typed as _is$typed } from "../../../../util.ts";
import type * as AppRockskySongDefsSongViewBasic from "../song/defs/songViewBasic.ts";

const is$typed = _is$typed, validate = _validate;
const id = "app.rocksky.player.defs";

export interface CurrentlyPlayingViewDetailed {
  $type?: "app.rocksky.player.defs#currentlyPlayingViewDetailed";
  /** The title of the currently playing track */
  title?: string;
}

const hashCurrentlyPlayingViewDetailed = "currentlyPlayingViewDetailed";

export function isCurrentlyPlayingViewDetailed<V>(v: V) {
  return is$typed(v, id, hashCurrentlyPlayingViewDetailed);
}

export function validateCurrentlyPlayingViewDetailed<V>(v: V) {
  return validate<CurrentlyPlayingViewDetailed & V>(
    v,
    id,
    hashCurrentlyPlayingViewDetailed,
  );
}

export interface PlaybackQueueViewDetailed {
  $type?: "app.rocksky.player.defs#playbackQueueViewDetailed";
  tracks?: (AppRockskySongDefsSongViewBasic.Main)[];
}

const hashPlaybackQueueViewDetailed = "playbackQueueViewDetailed";

export function isPlaybackQueueViewDetailed<V>(v: V) {
  return is$typed(v, id, hashPlaybackQueueViewDetailed);
}

export function validatePlaybackQueueViewDetailed<V>(v: V) {
  return validate<PlaybackQueueViewDetailed & V>(
    v,
    id,
    hashPlaybackQueueViewDetailed,
  );
}
