import { lexicons } from "../../../lexicons.js";
import { isObj, hasProp } from "../../../util.js";
function isRecord(v) {
  return isObj(v) && hasProp(v, "$type") && (v.$type === "app.rocksky.playlist#main" || v.$type === "app.rocksky.playlist");
}
function validateRecord(v) {
  return lexicons.validate("app.rocksky.playlist#main", v);
}
export {
  isRecord,
  validateRecord
};
