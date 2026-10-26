import { lexicons } from "../../../lexicons.js";
import { isObj, hasProp } from "../../../util.js";
function isRecord(v) {
  return isObj(v) && hasProp(v, "$type") && (v.$type === "app.rocksky.scrobble#main" || v.$type === "app.rocksky.scrobble");
}
function validateRecord(v) {
  return lexicons.validate("app.rocksky.scrobble#main", v);
}
export {
  isRecord,
  validateRecord
};
