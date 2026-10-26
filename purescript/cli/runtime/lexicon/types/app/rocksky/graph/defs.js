import { lexicons } from "../../../../lexicons.js";
import { isObj, hasProp } from "../../../../util.js";
function isNotFoundActor(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.graph.defs#notFoundActor";
}
function validateNotFoundActor(v) {
  return lexicons.validate("app.rocksky.graph.defs#notFoundActor", v);
}
function isRelationship(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.graph.defs#relationship";
}
function validateRelationship(v) {
  return lexicons.validate("app.rocksky.graph.defs#relationship", v);
}
export {
  isNotFoundActor,
  isRelationship,
  validateNotFoundActor,
  validateRelationship
};
