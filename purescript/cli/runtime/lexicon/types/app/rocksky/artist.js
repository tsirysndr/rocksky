import { lexicons } from "../../../lexicons.js";
import { isObj, hasProp } from "../../../util.js";
function isRecord(v) {
  return isObj(v) && hasProp(v, "$type") && (v.$type === "app.rocksky.artist#main" || v.$type === "app.rocksky.artist");
}
function validateRecord(v) {
  return lexicons.validate("app.rocksky.artist#main", v);
}
export {
  isRecord,
  validateRecord
};
