import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

// dataDir === null  -> in-memory database
// dataDir === "..." -> persisted on disk at that directory
export const openImpl = (dataDir) => () =>
  drizzle(new PGlite(dataDir === null ? undefined : dataDir));

export const closeImpl = (db) => () => db.$client.close();
