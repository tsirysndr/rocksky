import {
  pgTable,
  serial as serialD,
  integer as integerD,
  bigint as bigintD,
  text as textD,
  varchar as varcharD,
  boolean as booleanD,
  doublePrecision as doublePrecisionD,
  real as realD,
  timestamp as timestampD,
  jsonb as jsonbD,
} from "drizzle-orm/pg-core";

export const tableImpl = (name) => (cols) => pgTable(name, cols);

export const serial = (name) => serialD(name);
export const integer = (name) => integerD(name);
export const bigint = (name) => bigintD(name, { mode: "number" });
export const text = (name) => textD(name);
export const varchar = (name) => (length) => varcharD(name, { length });
export const boolean = (name) => booleanD(name);
export const real = (name) => realD(name);
export const doublePrecision = (name) => doublePrecisionD(name);
export const timestamp = (name) => timestampD(name, { mode: "date" });
export const timestampTz = (name) => timestampD(name, { mode: "date", withTimezone: true });
export const jsonb = (name) => jsonbD(name);
export const textArray = (name) => textD(name).array();
export const integerArray = (name) => integerD(name).array();

export const defaultNow = (c) => c.defaultNow();
export const references = (target) => (c) => c.references(() => target);
export const referencesLazy = (thunk) => (c) => c.references(() => thunk());
