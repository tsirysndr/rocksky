import { lexicons } from "../../../../lexicons.js";
import { isObj, hasProp } from "../../../../util.js";
function isPlaylistViewDetailed(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.playlist.defs#playlistViewDetailed";
}
function validatePlaylistViewDetailed(v) {
  return lexicons.validate("app.rocksky.playlist.defs#playlistViewDetailed", v);
}
function isPlaylistViewBasic(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.playlist.defs#playlistViewBasic";
}
function validatePlaylistViewBasic(v) {
  return lexicons.validate("app.rocksky.playlist.defs#playlistViewBasic", v);
}
export {
  isPlaylistViewBasic,
  isPlaylistViewDetailed,
  validatePlaylistViewBasic,
  validatePlaylistViewDetailed
};
