import { lexicons } from "../../../lexicons.js";
import { isObj, hasProp } from "../../../util.js";
function isRecord(v) {
  return isObj(v) && hasProp(v, "$type") && (v.$type === "app.rocksky.album#main" || v.$type === "app.rocksky.album");
}
function validateRecord(v) {
  return lexicons.validate("app.rocksky.album#main", v);
}
export {
  isRecord,
  validateRecord
};
