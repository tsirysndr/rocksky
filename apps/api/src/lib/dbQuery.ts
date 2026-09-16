import { consola } from "consola";
import { cancelPool, pool } from "drizzle";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Effect, Exit } from "effect";

const cancelBackend = async (pid: number) => {
  try {
    const client = await cancelPool.connect();
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
export const dbQuery = <A>(
  label: string,
  run: (db: NodePgDatabase) => Promise<A>,
): Effect.Effect<A, Error> =>
  Effect.acquireUseRelease(
    Effect.tryPromise({
      try: () => pool.connect(),
      catch: (error) =>
        new Error(`${label}: failed to acquire pg client: ${error}`),
    }),
    (client) =>
      Effect.tryPromise({
        try: (signal) => {
          const { processID } = client as unknown as { processID?: number };
          const onAbort = () => {
            if (processID) void cancelBackend(processID);
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
