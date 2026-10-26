import { lexicons } from "../../../../lexicons.js";
import { isObj, hasProp } from "../../../../util.js";
function isChartsView(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.charts.defs#chartsView";
}
function validateChartsView(v) {
  return lexicons.validate("app.rocksky.charts.defs#chartsView", v);
}
function isScrobbleViewBasic(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.charts.defs#scrobbleViewBasic";
}
function validateScrobbleViewBasic(v) {
  return lexicons.validate("app.rocksky.charts.defs#scrobbleViewBasic", v);
}
export {
  isChartsView,
  isScrobbleViewBasic,
  validateChartsView,
  validateScrobbleViewBasic
};
