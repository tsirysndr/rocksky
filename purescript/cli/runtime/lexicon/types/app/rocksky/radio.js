import { lexicons } from "../../../lexicons.js";
import { isObj, hasProp } from "../../../util.js";
function isRecord(v) {
  return isObj(v) && hasProp(v, "$type") && (v.$type === "app.rocksky.radio#main" || v.$type === "app.rocksky.radio");
}
function validateRecord(v) {
  return lexicons.validate("app.rocksky.radio#main", v);
}
export {
  isRecord,
  validateRecord
};
