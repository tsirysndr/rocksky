import { lexicons } from "../../../../lexicons.js";
import { isObj, hasProp } from "../../../../util.js";
function isApiKeyView(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.apikey.defs#apiKeyView";
}
function validateApiKeyView(v) {
  return lexicons.validate("app.rocksky.apikey.defs#apiKeyView", v);
}
export {
  isApiKeyView,
  validateApiKeyView
};
