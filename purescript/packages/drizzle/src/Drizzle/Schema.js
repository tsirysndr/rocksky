import { getTableName } from "drizzle-orm";

// Shared across dialects: drizzle tables expose their columns as properties,
// and every column builder has the same modifier methods.

export const columns = (t) => t;
export const tableName = (t) => getTableName(t);

export const notNull = (c) => c.notNull();
export const primaryKey = (c) => c.primaryKey();
export const unique = (c) => c.unique();
export const withDefault = (v) => (c) => c.default(v);
export const defaultSQL = (q) => (c) => c.default(q);
