import dns from "node:dns";
import { toList } from "../../gleam.mjs";
import { Some, None } from "../../../gleam_stdlib/gleam/option.mjs";

export const argv = () => toList(process.argv);
export const exit = (code) => process.exit(code);
export const pid = () => process.pid;
export const env = (name) => {
  const v = process.env[name];
  return v === undefined ? new None() : new Some(v);
};
export const on = (event, handler) => {
  process.on(event, (e) => handler(e));
};
export const once = (event, handler) => {
  process.once(event, (e) => handler(e));
};
export const kill = (signal) => {
  process.kill(process.pid, signal);
};
export const setDnsIpv4First = () => dns.setDefaultResultOrder("ipv4first");
export const keepAlive = () => {
  setInterval(() => {}, 1 << 30);
};
export const setInterval_ = (ms, f) => setInterval(() => f(), ms);
export { setInterval_ as setInterval };
export const clearInterval_ = (h) => clearInterval(h);
export { clearInterval_ as clearInterval };
export const setTimeout_ = (ms, f) => setTimeout(() => f(), ms);
export { setTimeout_ as setTimeout };
export const clearTimeout_ = (h) => clearTimeout(h);
export { clearTimeout_ as clearTimeout };
