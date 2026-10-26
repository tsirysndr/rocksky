import { lexicons } from "../../../../lexicons.js";
import { isObj, hasProp } from "../../../../util.js";
function isArtistViewBasic(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.artist.defs#artistViewBasic";
}
function validateArtistViewBasic(v) {
  return lexicons.validate("app.rocksky.artist.defs#artistViewBasic", v);
}
function isArtistViewDetailed(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.artist.defs#artistViewDetailed";
}
function validateArtistViewDetailed(v) {
  return lexicons.validate("app.rocksky.artist.defs#artistViewDetailed", v);
}
function isSongViewBasic(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.artist.defs#songViewBasic";
}
function validateSongViewBasic(v) {
  return lexicons.validate("app.rocksky.artist.defs#songViewBasic", v);
}
function isListenerViewBasic(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.artist.defs#listenerViewBasic";
}
function validateListenerViewBasic(v) {
  return lexicons.validate("app.rocksky.artist.defs#listenerViewBasic", v);
}
function isArtistMbid(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.artist.defs#artistMbid";
}
function validateArtistMbid(v) {
  return lexicons.validate("app.rocksky.artist.defs#artistMbid", v);
}
export {
  isArtistMbid,
  isArtistViewBasic,
  isArtistViewDetailed,
  isListenerViewBasic,
  isSongViewBasic,
  validateArtistMbid,
  validateArtistViewBasic,
  validateArtistViewDetailed,
  validateListenerViewBasic,
  validateSongViewBasic
};
