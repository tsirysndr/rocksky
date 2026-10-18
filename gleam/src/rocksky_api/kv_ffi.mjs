import { Some, None } from "../../gleam_stdlib/gleam/option.mjs";
export const newMemory = () => new Map();
export const memoryGet = (m, k) => (m.has(k) ? new Some(m.get(k)) : new None());
export const memorySet = (m, k, v) => {
  m.set(k, v);
};
export const memoryDelete = (m, k) => {
  m.delete(k);
};
