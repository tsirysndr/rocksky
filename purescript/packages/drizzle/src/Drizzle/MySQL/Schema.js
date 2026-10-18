import {
  mysqlTable,
  serial as serialD,
  int as intD,
  bigint as bigintD,
  varchar as varcharD,
  text as textD,
  boolean as booleanD,
  double as doubleD,
  timestamp as timestampD,
  datetime as datetimeD,
} from "drizzle-orm/mysql-core";

export const tableImpl = (name) => (cols) => mysqlTable(name, cols);

export const serial = (name) => serialD(name);
export const int = (name) => intD(name);
export const bigint = (name) => bigintD(name, { mode: "number" });
export const varchar = (name) => (length) => varcharD(name, { length });
export const text = (name) => textD(name);
export const boolean = (name) => booleanD(name);
export const double = (name) => doubleD(name);
export const timestamp = (name) => timestampD(name, { mode: "date" });
export const datetime = (name) => datetimeD(name, { mode: "date" });

export const autoIncrement = (c) => c.autoincrement();
export const defaultNow = (c) => c.defaultNow();
