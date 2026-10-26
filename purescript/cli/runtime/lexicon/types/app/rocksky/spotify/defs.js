import { lexicons } from "../../../../lexicons.js";
import { isObj, hasProp } from "../../../../util.js";
function isSpotifyTrackView(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.spotify.defs#spotifyTrackView";
}
function validateSpotifyTrackView(v) {
  return lexicons.validate("app.rocksky.spotify.defs#spotifyTrackView", v);
}
export {
  isSpotifyTrackView,
  validateSpotifyTrackView
};
