import { lexicons } from "../../../../lexicons.js";
import { isObj, hasProp } from "../../../../util.js";
function isRadioViewBasic(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.radio.defs#radioViewBasic";
}
function validateRadioViewBasic(v) {
  return lexicons.validate("app.rocksky.radio.defs#radioViewBasic", v);
}
function isRadioViewDetailed(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.radio.defs#radioViewDetailed";
}
function validateRadioViewDetailed(v) {
  return lexicons.validate("app.rocksky.radio.defs#radioViewDetailed", v);
}
export {
  isRadioViewBasic,
  isRadioViewDetailed,
  validateRadioViewBasic,
  validateRadioViewDetailed
};
