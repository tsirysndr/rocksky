import { lexicons } from "../../../../lexicons.js";
import { isObj, hasProp } from "../../../../util.js";
function isFileView(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.dropbox.defs#fileView";
}
function validateFileView(v) {
  return lexicons.validate("app.rocksky.dropbox.defs#fileView", v);
}
function isFileListView(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.dropbox.defs#fileListView";
}
function validateFileListView(v) {
  return lexicons.validate("app.rocksky.dropbox.defs#fileListView", v);
}
function isTemporaryLinkView(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.dropbox.defs#temporaryLinkView";
}
function validateTemporaryLinkView(v) {
  return lexicons.validate("app.rocksky.dropbox.defs#temporaryLinkView", v);
}
export {
  isFileListView,
  isFileView,
  isTemporaryLinkView,
  validateFileListView,
  validateFileView,
  validateTemporaryLinkView
};
