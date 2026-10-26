import { lexicons } from "../../../../lexicons.js";
import { isObj, hasProp } from "../../../../util.js";
function isRecord(v) {
  return isObj(v) && hasProp(v, "$type") && (v.$type === "app.bsky.actor.profile#main" || v.$type === "app.bsky.actor.profile");
}
function validateRecord(v) {
  return lexicons.validate("app.bsky.actor.profile#main", v);
}
export {
  isRecord,
  validateRecord
};
