import { lexicons } from "../../../../lexicons.js";
import { isObj, hasProp } from "../../../../util.js";
function isAuthor(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.shout.defs#author";
}
function validateAuthor(v) {
  return lexicons.validate("app.rocksky.shout.defs#author", v);
}
function isShoutView(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.shout.defs#shoutView";
}
function validateShoutView(v) {
  return lexicons.validate("app.rocksky.shout.defs#shoutView", v);
}
export {
  isAuthor,
  isShoutView,
  validateAuthor,
  validateShoutView
};
