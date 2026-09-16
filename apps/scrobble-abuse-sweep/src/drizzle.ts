import { consola } from "consola";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "./utils/env.ts";

const pool = new pg.Pool({
  connectionString: env.XATA_WRITE_POSTGRES_URL || env.XATA_POSTGRES_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: "rocksky-scrobble-abuse-sweep:primary",
  // The sweep's window queries are heavy; without a cap one of them wedging
  // would hold a backend until the next cron tick.
  statement_timeout: 300_000,
  idle_in_transaction_session_timeout: 30_000,
});

pool.on("error", (err: Error) => {
  consola.error("[db] idle pg client error:", err.message);
});

const db = drizzle(pool);

export default { db };
