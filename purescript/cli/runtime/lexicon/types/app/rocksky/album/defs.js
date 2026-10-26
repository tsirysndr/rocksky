import { lexicons } from "../../../../lexicons.js";
import { isObj, hasProp } from "../../../../util.js";
function isAlbumViewBasic(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.album.defs#albumViewBasic";
}
function validateAlbumViewBasic(v) {
  return lexicons.validate("app.rocksky.album.defs#albumViewBasic", v);
}
function isAlbumViewDetailed(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.album.defs#albumViewDetailed";
}
function validateAlbumViewDetailed(v) {
  return lexicons.validate("app.rocksky.album.defs#albumViewDetailed", v);
}
export {
  isAlbumViewBasic,
  isAlbumViewDetailed,
  validateAlbumViewBasic,
  validateAlbumViewDetailed
};
