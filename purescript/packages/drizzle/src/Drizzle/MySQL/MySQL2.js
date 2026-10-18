import { drizzle } from "drizzle-orm/mysql2";

// Creates a `mysql2` pool from a connection string (mysql://user:pass@host/db).
export const connectImpl = (connectionString) => () =>
  drizzle(connectionString, { mode: "default" });
export const closeImpl = (db) => () => db.$client.end();
export const mock = () => drizzle.mock();
