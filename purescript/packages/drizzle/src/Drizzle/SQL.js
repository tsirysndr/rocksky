import {
  sql,
  eq as eqD, ne as neD, gt as gtD, gte as gteD, lt as ltD, lte as lteD,
  and as andD, or as orD, not as notD,
  isNull as isNullD, isNotNull as isNotNullD,
  inArray as inArrayD, notInArray as notInArrayD,
  like as likeD, ilike as ilikeD, notLike as notLikeD, notIlike as notIlikeD, between as betweenD,
  asc as ascD, desc as descD,
  count as countD, countDistinct as countDistinctD, max as maxD, min as minD, sum as sumD, avg as avgD,
  exists as existsD, notExists as notExistsD,
} from "drizzle-orm";

export const raw = (s) => sql.raw(s);
// A bare value. Drizzle binds it as a parameter wherever it appears in a
// fragment, and when it is compared against a column (eq, inArray, ...) the
// column's own type mapping applies (booleans/dates for SQLite integer modes,
// JSON, ...). Wrapping it in sql`${v}` would skip that mapping.
export const param = (v) => v;
export const nullValue = null;
export const empty = sql.empty();

// sql`a${x}b${y}c` is sql(["a","b","c"], x, y): a strings array with a `raw`
// property is what the tag receives, so we build one.
export const templateImpl = (strings) => (values) => {
  const parts = strings.length === values.length + 1 ? strings : [...strings, ...Array(Math.max(0, values.length + 1 - strings.length)).fill("")];
  const strs = parts.slice(0, values.length + 1);
  strs.raw = strs;
  return sql(strs, ...values);
};

export const join = (sep) => (parts) => sql.join(parts, sep);
export const identifier = (name) => sql.identifier(name);
export const as = (alias) => (fragment) => fragment.as(alias);

export const eq = (a) => (b) => eqD(a, b);
export const ne = (a) => (b) => neD(a, b);
export const gt = (a) => (b) => gtD(a, b);
export const gte = (a) => (b) => gteD(a, b);
export const lt = (a) => (b) => ltD(a, b);
export const lte = (a) => (b) => lteD(a, b);

export const and = (a) => (b) => andD(a, b);
export const or = (a) => (b) => orD(a, b);
export const not = (a) => notD(a);
export const andAllImpl = (h) => (t) => andD(h, ...t);
export const orAllImpl = (h) => (t) => orD(h, ...t);

export const isNull = (a) => isNullD(a);
export const isNotNull = (a) => isNotNullD(a);
export const inArray = (a) => (xs) => inArrayD(a, xs);
export const notInArray = (a) => (xs) => notInArrayD(a, xs);
export const inQuery = (a) => (q) => inArrayD(a, q);
export const notInQuery = (a) => (q) => notInArrayD(a, q);

export const like = (a) => (b) => likeD(a, b);
export const ilike = (a) => (b) => ilikeD(a, b);
export const notLike = (a) => (b) => notLikeD(a, b);
export const notIlike = (a) => (b) => notIlikeD(a, b);
export const between = (a) => (lo) => (hi) => betweenD(a, lo, hi);

export const asc = (a) => ascD(a);
export const desc = (a) => descD(a);

export const count = countD();
export const countOf = (a) => countD(a);
export const countDistinct = (a) => countDistinctD(a);
export const max = (a) => maxD(a);
export const min = (a) => minD(a);
export const sum = (a) => sumD(a);
export const avg = (a) => avgD(a);

export const exists = (q) => existsD(q);
export const notExists = (q) => notExistsD(q);
