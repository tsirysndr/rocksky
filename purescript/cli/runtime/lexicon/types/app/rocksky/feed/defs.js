import { lexicons } from "../../../../lexicons.js";
import { isObj, hasProp } from "../../../../util.js";
function isSearchResultsView(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.feed.defs#searchResultsView";
}
function validateSearchResultsView(v) {
  return lexicons.validate("app.rocksky.feed.defs#searchResultsView", v);
}
function isNowPlayingView(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.feed.defs#nowPlayingView";
}
function validateNowPlayingView(v) {
  return lexicons.validate("app.rocksky.feed.defs#nowPlayingView", v);
}
function isNowPlayingsView(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.feed.defs#nowPlayingsView";
}
function validateNowPlayingsView(v) {
  return lexicons.validate("app.rocksky.feed.defs#nowPlayingsView", v);
}
function isFeedGeneratorsView(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.feed.defs#feedGeneratorsView";
}
function validateFeedGeneratorsView(v) {
  return lexicons.validate("app.rocksky.feed.defs#feedGeneratorsView", v);
}
function isFeedGeneratorView(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.feed.defs#feedGeneratorView";
}
function validateFeedGeneratorView(v) {
  return lexicons.validate("app.rocksky.feed.defs#feedGeneratorView", v);
}
function isFeedUriView(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.feed.defs#feedUriView";
}
function validateFeedUriView(v) {
  return lexicons.validate("app.rocksky.feed.defs#feedUriView", v);
}
function isFeedItemView(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.feed.defs#feedItemView";
}
function validateFeedItemView(v) {
  return lexicons.validate("app.rocksky.feed.defs#feedItemView", v);
}
function isFeedView(v) {
  return isObj(v) && hasProp(v, "$type") && v.$type === "app.rocksky.feed.defs#feedView";
}
function validateFeedView(v) {
  return lexicons.validate("app.rocksky.feed.defs#feedView", v);
}
export {
  isFeedGeneratorView,
  isFeedGeneratorsView,
  isFeedItemView,
  isFeedUriView,
  isFeedView,
  isNowPlayingView,
  isNowPlayingsView,
  isSearchResultsView,
  validateFeedGeneratorView,
  validateFeedGeneratorsView,
  validateFeedItemView,
  validateFeedUriView,
  validateFeedView,
  validateNowPlayingView,
  validateNowPlayingsView,
  validateSearchResultsView
};
