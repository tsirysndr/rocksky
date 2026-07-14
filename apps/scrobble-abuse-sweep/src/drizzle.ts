import { consola } from "consola";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "./utils/env.ts";

const pool = new pg.Pool({
  connectionString: env.XATA_POSTGRES_URL,
  max: 5,
});

pool.on("error", (err: Error) => {
  consola.error("[db] idle pg client error:", err.message);
});

const db = drizzle(pool);

export default { db };
