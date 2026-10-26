import { lexicons } from "../../../../lexicons.js";
import { isObj, hasProp } from "../../../../util.js";
function isSongViewBasic(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.song.defs#songViewBasic";
}
function validateSongViewBasic(v) {
  return lexicons.validate("app.rocksky.song.defs#songViewBasic", v);
}
function isSongViewDetailed(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.song.defs#songViewDetailed";
}
function validateSongViewDetailed(v) {
  return lexicons.validate("app.rocksky.song.defs#songViewDetailed", v);
}
export {
  isSongViewBasic,
  isSongViewDetailed,
  validateSongViewBasic,
  validateSongViewDetailed
};
