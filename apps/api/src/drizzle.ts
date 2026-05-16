import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "lib/env";
import { consola } from "consola";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: env.XATA_POSTGRES_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (err) => {
  consola.error("Idle pg client error (connection terminated by server):", err.message);
});

const db = drizzle(pool);

export default { db };
