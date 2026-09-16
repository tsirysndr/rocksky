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

const writeUrl = env.XATA_WRITE_POSTGRES_URL || env.XATA_POSTGRES_URL;
const readUrl = env.XATA_READ_POSTGRES_URL || env.XATA_POSTGRES_URL;

// When the split is not configured both names resolve to the same endpoint.
// Building two pools then would silently double this process's connection
// count against the same server, which is the problem we are trying to avoid.
export const isSplit = readUrl !== writeUrl;

const poolConfig = (url: string, name: string): pg.PoolConfig => ({
  connectionString: url,
  max: env.PG_MAX_CONNECTIONS,
  idleTimeoutMillis: 30_000,
  // Shorter than every handler's own timeout budget: when the pool is drained
  // the right move is to shed the request quickly, not to sit in the checkout
  // queue until the caller has already timed out.
  connectionTimeoutMillis: 5_000,
  application_name: name,
  // Effect.timeout interrupts the fiber but cannot cancel an in-flight pg
  // query, so a timed-out handler leaves its backend running. These two are the
  // only thing that ever reclaims it.
  statement_timeout: env.PG_STATEMENT_TIMEOUT,
  idle_in_transaction_session_timeout: 30_000,
});

const onError = (label: string) => (err: Error) => {
  consola.error(`Idle pg client error on ${label}:`, err.message);
};

/** Primary. Every write, and every read that must reflect one. */
export const pool = new pg.Pool(
  poolConfig(writeUrl, `${applicationName}:primary`),
);
pool.on("error", onError("primary"));

/** Read-only replica, or the primary pool itself when no replica is set. */
export const readPool = isSplit
  ? new pg.Pool(poolConfig(readUrl, `${applicationName}:replica`))
  : pool;
if (isSplit) readPool.on("error", onError("replica"));

// Dedicated to issuing pg_cancel_backend (see lib/dbQuery.ts). It has to be a
// separate pool: the whole point is to be reachable when the main pool is the
// thing that is saturated. pg_cancel_backend only works on the server that owns
// the backend, so a cancel pool is needed per endpoint.
const cancelConfig = (url: string, name: string): pg.PoolConfig => ({
  connectionString: url,
  max: 2,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 2_000,
  application_name: name,
  statement_timeout: 5_000,
});

export const cancelPool = new pg.Pool(
  cancelConfig(writeUrl, `${applicationName}:cancel:primary`),
);
cancelPool.on("error", onError("primary cancel"));

export const readCancelPool = isSplit
  ? new pg.Pool(cancelConfig(readUrl, `${applicationName}:cancel:replica`))
  : cancelPool;
if (isSplit) readCancelPool.on("error", onError("replica cancel"));

/**
 * Fails unless the primary pool can actually write.
 *
 * XATA_POSTGRES_URL is documented as read+write but is not guaranteed to stay
 * that way — it has pointed at a replica in production, which turned the write
 * fallback into a silent hole that swallowed thousands of scrobbles. Checking
 * at startup makes a misrouted primary loud and immediate.
 */
export const ensureWritable = async () => {
  const { rows } = await pool.query<{
    in_recovery: boolean;
    read_only: string;
  }>(
    "select pg_is_in_recovery() as in_recovery, current_setting('transaction_read_only') as read_only",
  );
  const [{ in_recovery, read_only }] = rows;
  if (in_recovery || read_only === "on") {
    throw new Error(
      `The write endpoint is read-only (pg_is_in_recovery=${in_recovery}, ` +
        `transaction_read_only=${read_only}). Point XATA_WRITE_POSTGRES_URL at the ` +
        "primary — XATA_POSTGRES_URL is currently a replica and cannot accept writes.",
    );
  }
};

/** Primary-backed. Safe default: correct for reads and writes alike. */
const db = drizzle(pool);

/**
 * Replica-backed. Only for reads that tolerate replication lag — never for a
 * write, and never for a read that has to show something just written.
 */
export const readDb = isSplit ? drizzle(readPool) : db;

export default { db, readDb };
