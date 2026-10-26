import { lexicons } from "../../../lexicons.js";
import { isObj, hasProp } from "../../../util.js";
function isRecord(v) {
  return isObj(v) && hasProp(v, "$type") && (v.$type === "app.rocksky.like#main" || v.$type === "app.rocksky.like");
}
function validateRecord(v) {
  return lexicons.validate("app.rocksky.like#main", v);
}
export {
  isRecord,
  validateRecord
};
