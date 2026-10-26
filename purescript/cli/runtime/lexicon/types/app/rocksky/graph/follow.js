import { lexicons } from "../../../../lexicons.js";
import { isObj, hasProp } from "../../../../util.js";
function isRecord(v) {
  return isObj(v) && hasProp(v, "$type") && (v.$type === "app.rocksky.graph.follow#main" || v.$type === "app.rocksky.graph.follow");
}
function validateRecord(v) {
  return lexicons.validate("app.rocksky.graph.follow#main", v);
}
export {
  isRecord,
  validateRecord
};
