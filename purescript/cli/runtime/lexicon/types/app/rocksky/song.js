import { lexicons } from "../../../lexicons.js";
import { isObj, hasProp } from "../../../util.js";
function isRecord(v) {
  return isObj(v) && hasProp(v, "$type") && (v.$type === "app.rocksky.song#main" || v.$type === "app.rocksky.song");
}
function validateRecord(v) {
  return lexicons.validate("app.rocksky.song#main", v);
}
export {
  isRecord,
  validateRecord
};
