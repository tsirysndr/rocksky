import { Ok, Error as GError, toList } from "../../gleam.mjs";
import { Some, None } from "../../../gleam_stdlib/gleam/option.mjs";

const opt = (v) => (v === undefined || v === null ? new None() : new Some(v));

export const message = (e) =>
  e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
export const name = (e) => (e instanceof Error ? e.name : typeof e);
export const code = (e) =>
  opt(e && typeof e === "object" && typeof e.code === "string" ? e.code : undefined);
export const status = (e) =>
  opt(e && typeof e === "object" && typeof e.status === "number" ? e.status : undefined);
export const errorField = (e) =>
  opt(e && typeof e === "object" && typeof e.error === "string" ? e.error : undefined);

export function describe(e, depth = 0) {
  if (!(e instanceof Error)) return String(e);
  const indent = "  ".repeat(depth);
  const lines = [`${indent}${e.name}: ${e.message}`];
  if (e instanceof AggregateError) {
    for (const inner of e.errors) lines.push(describe(inner, depth + 1));
  }
  if (e.cause !== undefined) {
    lines.push(`${indent}  caused by:`);
    lines.push(describe(e.cause, depth + 1));
  }
  return lines.join("\n");
}

export const newError = (m) => new Error(m);
export const toDynamic = (e) => e;
export const fromDynamic = (d) => d;
export const raise = (e) => {
  throw e;
};
export const attempt = (p) =>
  Promise.resolve(p).then(
    (v) => new Ok(v),
    (e) => new GError(e),
  );
export const tryCatch = (f) => {
  try {
    return new Ok(f());
  } catch (e) {
    return new GError(e);
  }
};
export const identity = (a) => a;
export const get = (o, k) => (o == null ? undefined : o[k]);
export const set = (o, k, v) => {
  o[k] = v;
  return o;
};
export const isNullish = (d) => d === null || d === undefined;
export const undefined_ = () => undefined;
export { undefined_ as undefined };
export const nullValue = () => null;
export const object = (entries) => {
  const o = {};
  for (const [k, v] of entries) o[k] = v;
  return o;
};
export const entries = (o) =>
  toList(o && typeof o === "object" ? Object.entries(o).map(([k, v]) => [k, v]) : []);
export const stringify = (d) => {
  try {
    return JSON.stringify(d);
  } catch {
    return String(d);
  }
};
export const parseJson = (s) => {
  try {
    return new Ok(JSON.parse(s));
  } catch (e) {
    return new GError(e);
  }
};
export const nowMs = () => Date.now();
export const hrtimeNanos = () => Number(process.hrtime.bigint());
export const dateToIso = (d) => new Date(d).toISOString();
export const isDate = (d) => d instanceof Date;
export const toString = value => String(value);
export const stringLength = value => value.length;

export const randomInt = max => Math.floor(Math.random() * max);
export const regexTest = (pattern, value) => new RegExp(pattern).test(value);
export const numberFromString=value=>{const number=Number(value);return Number.isFinite(number)?new Some(number):new None();};
export const causes=error=>{const values=[],seen=new Set();while(error&&typeof error==='object'&&!seen.has(error)){seen.add(error);values.push(error);error=error.cause;}return toList(values);};

export const truthy = value => !!value;
export const parseDateMs=value=>{const n=Date.parse(value);return Number.isFinite(n)?new Some(n):new None();};
