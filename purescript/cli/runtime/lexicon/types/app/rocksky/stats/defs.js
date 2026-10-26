import { lexicons } from "../../../../lexicons.js";
import { isObj, hasProp } from "../../../../util.js";
function isStatsView(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.stats.defs#statsView";
}
function validateStatsView(v) {
  return lexicons.validate("app.rocksky.stats.defs#statsView", v);
}
export {
  isStatsView,
  validateStatsView
};
