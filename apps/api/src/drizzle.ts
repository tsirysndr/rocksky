import { basename } from "node:path";
import { consola } from "consola";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "lib/env";
import pg from "pg";

// index.ts and server.ts both import this module, so without a distinguishing
// name every backend in pg_stat_activity looks identical.
const applicationName =
  env.PG_APP_NAME ||
  `rocksky-api:${basename(process.argv[1] ?? "unknown").replace(/\.[cm]?[jt]s$/, "")}`;

const poolConfig: pg.PoolConfig = {
  connectionString: env.XATA_POSTGRES_URL,
  max: env.PG_MAX_CONNECTIONS,
  idleTimeoutMillis: 30_000,
  // Shorter than every handler's own timeout budget: when the pool is drained
  // the right move is to shed the request quickly, not to sit in the checkout
  // queue until the caller has already timed out.
  connectionTimeoutMillis: 5_000,
  application_name: applicationName,
  // Effect.timeout interrupts the fiber but cannot cancel an in-flight pg
  // query, so a timed-out handler leaves its backend running. These two are the
  // only thing that ever reclaims it.
  statement_timeout: env.PG_STATEMENT_TIMEOUT,
  idle_in_transaction_session_timeout: 30_000,
};

export const pool = new pg.Pool(poolConfig);

pool.on("error", (err) => {
  consola.error(
    "Idle pg client error (connection terminated by server):",
    err.message,
  );
});

// Dedicated to issuing pg_cancel_backend (see lib/dbQuery.ts). It has to be a
// separate pool: the whole point is to be reachable when the main pool is the
// thing that is saturated.
export const cancelPool = new pg.Pool({
  connectionString: env.XATA_POSTGRES_URL,
  max: 2,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 2_000,
  application_name: `${applicationName}:cancel`,
  statement_timeout: 5_000,
});

cancelPool.on("error", (err) => {
  consola.error("Idle pg cancel-client error:", err.message);
});

const db = drizzle(pool);

export default { db };
