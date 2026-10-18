import {
  sqliteTable,
  integer as integerD,
  text as textD,
  real as realD,
} from "drizzle-orm/sqlite-core";

export const tableImpl = (name) => (cols) => sqliteTable(name, cols);

export const integer = (name) => integerD(name);
export const integerBoolean = (name) => integerD(name, { mode: "boolean" });
export const integerTimestamp = (name) => integerD(name, { mode: "timestamp_ms" });
export const text = (name) => textD(name);
export const real = (name) => realD(name);

export const primaryKeyAutoIncrement = (c) => c.primaryKey({ autoIncrement: true });
