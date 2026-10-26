import { lexicons } from "../../../../lexicons.js";
import { isObj, hasProp } from "../../../../util.js";
function isScrobbleViewBasic(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.scrobble.defs#scrobbleViewBasic";
}
function validateScrobbleViewBasic(v) {
  return lexicons.validate("app.rocksky.scrobble.defs#scrobbleViewBasic", v);
}
function isScrobbleViewDetailed(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.scrobble.defs#scrobbleViewDetailed";
}
function validateScrobbleViewDetailed(v) {
  return lexicons.validate("app.rocksky.scrobble.defs#scrobbleViewDetailed", v);
}
export {
  isScrobbleViewBasic,
  isScrobbleViewDetailed,
  validateScrobbleViewBasic,
  validateScrobbleViewDetailed
};
