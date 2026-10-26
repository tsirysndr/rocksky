import { lexicons } from "../../../../lexicons.js";
import { isObj, hasProp } from "../../../../util.js";
function isProfileViewDetailed(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.actor.defs#profileViewDetailed";
}
function validateProfileViewDetailed(v) {
  return lexicons.validate("app.rocksky.actor.defs#profileViewDetailed", v);
}
function isProfileViewBasic(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.actor.defs#profileViewBasic";
}
function validateProfileViewBasic(v) {
  return lexicons.validate("app.rocksky.actor.defs#profileViewBasic", v);
}
function isNeighbourViewBasic(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.actor.defs#neighbourViewBasic";
}
function validateNeighbourViewBasic(v) {
  return lexicons.validate("app.rocksky.actor.defs#neighbourViewBasic", v);
}
function isCompatibilityViewBasic(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.actor.defs#compatibilityViewBasic";
}
function validateCompatibilityViewBasic(v) {
  return lexicons.validate("app.rocksky.actor.defs#compatibilityViewBasic", v);
}
function isArtistViewBasic(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.actor.defs#artistViewBasic";
}
function validateArtistViewBasic(v) {
  return lexicons.validate("app.rocksky.actor.defs#artistViewBasic", v);
}
export {
  isArtistViewBasic,
  isCompatibilityViewBasic,
  isNeighbourViewBasic,
  isProfileViewBasic,
  isProfileViewDetailed,
  validateArtistViewBasic,
  validateCompatibilityViewBasic,
  validateNeighbourViewBasic,
  validateProfileViewBasic,
  validateProfileViewDetailed
};
