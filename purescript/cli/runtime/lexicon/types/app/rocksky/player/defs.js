import { lexicons } from "../../../../lexicons.js";
import { isObj, hasProp } from "../../../../util.js";
function isCurrentlyPlayingViewDetailed(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.player.defs#currentlyPlayingViewDetailed";
}
function validateCurrentlyPlayingViewDetailed(v) {
  return lexicons.validate(
    "app.rocksky.player.defs#currentlyPlayingViewDetailed",
    v
  );
}
function isPlaybackQueueViewDetailed(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.player.defs#playbackQueueViewDetailed";
}
function validatePlaybackQueueViewDetailed(v) {
  return lexicons.validate(
    "app.rocksky.player.defs#playbackQueueViewDetailed",
    v
  );
}
export {
  isCurrentlyPlayingViewDetailed,
  isPlaybackQueueViewDetailed,
  validateCurrentlyPlayingViewDetailed,
  validatePlaybackQueueViewDetailed
};
