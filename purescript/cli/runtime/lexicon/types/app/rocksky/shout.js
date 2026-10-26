import { lexicons } from "../../../lexicons.js";
import { isObj, hasProp } from "../../../util.js";
function isRecord(v) {
  return isObj(v) && hasProp(v, "$type") && (v.$type === "app.rocksky.shout#main" || v.$type === "app.rocksky.shout");
}
function validateRecord(v) {
  return lexicons.validate("app.rocksky.shout#main", v);
}
export {
  isRecord,
  validateRecord
};
