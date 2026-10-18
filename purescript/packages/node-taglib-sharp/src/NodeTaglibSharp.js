import { File } from "node-taglib-sharp";

export const createFromPath = (path) => () => File.createFromPath(path);
export const save = (f) => () => {
  f.save();
};
export const dispose = (f) => () => {
  f.dispose();
};
export const withFile = (path) => (action) => () => {
  const f = File.createFromPath(path);
  try {
    return action(f)();
  } finally {
    f.dispose();
  }
};
export const durationMs = (f) => () => f.properties.durationMilliseconds;

export const getNumber = (k) => (f) => () => {
  const v = f.tag[k];
  return typeof v === "number" ? v : NaN;
};
export const setNumber = (k) => (f) => (v) => () => {
  f.tag[k] = v;
};
export const getStringImpl = (k) => (f) => () => {
  const v = f.tag[k];
  return typeof v === "string" && v.length > 0 ? v : null;
};
export const setString = (k) => (f) => (v) => () => {
  f.tag[k] = v;
};
export const getStrings = (k) => (f) => () => {
  const v = f.tag[k];
  return Array.isArray(v) ? v : [];
};
export const setStrings = (k) => (f) => (v) => () => {
  f.tag[k] = v;
};
export const getInt = (k) => (f) => () => {
  const v = f.tag[k];
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0;
};
export const setInt = (k) => (f) => (v) => () => {
  f.tag[k] = v;
};
