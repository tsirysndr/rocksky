import { consola } from "consola";
import { cancelPool, pool, readCancelPool, readPool } from "drizzle";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Effect, Exit } from "effect";
import type pg from "pg";

const cancelBackend = async (canceller: pg.Pool, pid: number) => {
  try {
    const client = await canceller.connect();
    try {
      await client.query("SELECT pg_cancel_backend($1)", [pid]);
    } finally {
      client.release();
    }
  } catch (err) {
    consola.warn(`Failed to cancel pg backend ${pid}:`, err);
  }
};

/**
 * Runs a query on a dedicated pooled client that is cancelled server-side when
 * the calling fiber is interrupted.
 *
 * `Effect.tryPromise` is not interruptible: when `Effect.timeout` fires, the
 * handler returns its fallback but the underlying pg query keeps running and
 * keeps its connection checked out until it finishes on its own. Under load
 * that is self-reinforcing — the abandoned queries are what exhaust the pool.
 * Here the interrupt reaches an AbortSignal, which fires pg_cancel_backend from
 * a separate pool, so the backend actually stops.
 */
const query =
  (source: pg.Pool, canceller: pg.Pool) =>
  <A>(
    label: string,
    run: (db: NodePgDatabase) => Promise<A>,
  ): Effect.Effect<A, Error> =>
    Effect.acquireUseRelease(
      Effect.tryPromise({
        try: () => source.connect(),
        catch: (error) =>
          new Error(`${label}: failed to acquire pg client: ${error}`),
      }),
      (client) =>
        Effect.tryPromise({
          try: (signal) => {
            const { processID } = client as unknown as { processID?: number };
            const onAbort = () => {
              if (processID) void cancelBackend(canceller, processID);
            };
            if (signal.aborted) onAbort();
            else signal.addEventListener("abort", onAbort, { once: true });
            return run(drizzle(client)).finally(() => {
              signal.removeEventListener("abort", onAbort);
            });
          },
          catch: (error) => new Error(`${label}: ${error}`),
        }),
      (client, exit) =>
        // After a cancel the client may still be draining the killed statement,
        // so discard it instead of handing a half-read connection back.
        Effect.sync(() => {
          client.release(Exit.isInterrupted(exit) || undefined);
        }),
    );

/**
 * Runs against the primary. Use for writes, and for reads that must reflect a
 * write that just happened — scrobbles, now-playing, and anything else the user
 * expects to see the instant it lands.
 */
export const dbQuery = query(pool, cancelPool);

/**
 * Runs against the read replica. Use for catalogue, aggregate and chart reads,
 * where being a few seconds behind the primary is invisible. Falls back to the
 * primary when no replica is configured.
 */
export const readQuery = query(readPool, readCancelPool);
