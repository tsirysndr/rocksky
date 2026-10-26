import { lexicons } from "../../../../lexicons.js";
import { isObj, hasProp } from "../../../../util.js";
function isRecord(v) {
  return isObj(v) && hasProp(v, "$type") && (v.$type === "app.rocksky.feed.generator#main" || v.$type === "app.rocksky.feed.generator");
}
function validateRecord(v) {
  return lexicons.validate("app.rocksky.feed.generator#main", v);
}
export {
  isRecord,
  validateRecord
};
