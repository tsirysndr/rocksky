import { lexicons } from "../../../../lexicons.js";
import { isObj, hasProp } from "../../../../util.js";
function isFileView(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.googledrive.defs#fileView";
}
function validateFileView(v) {
  return lexicons.validate("app.rocksky.googledrive.defs#fileView", v);
}
function isFileListView(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.googledrive.defs#fileListView";
}
function validateFileListView(v) {
  return lexicons.validate("app.rocksky.googledrive.defs#fileListView", v);
}
export {
  isFileListView,
  isFileView,
  validateFileListView,
  validateFileView
};
