import { drizzle } from "drizzle-orm/node-postgres";

// Creates a `pg` Pool from a connection string.
export const connectImpl = (connectionString) => () => drizzle(connectionString);
export const closeImpl = (db) => () => db.$client.end();
export const mock = () => drizzle.mock();
