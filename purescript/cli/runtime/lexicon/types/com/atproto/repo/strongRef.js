import { lexicons } from "../../../../lexicons.js";
import { isObj, hasProp } from "../../../../util.js";
function isMain(v) {
  return isObj(v) && hasProp(v, "$type") && (v.$type === "com.atproto.repo.strongRef#main" || v.$type === "com.atproto.repo.strongRef");
}
function validateMain(v) {
  return lexicons.validate("com.atproto.repo.strongRef#main", v);
}
export {
  isMain,
  validateMain
};
