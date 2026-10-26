function isObj(v) {
  return typeof v === "object" && v !== null;
}
function hasProp(data, prop) {
  return prop in data;
}
export {
  hasProp,
  isObj
};
