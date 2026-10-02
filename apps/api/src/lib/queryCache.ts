import { Cache, Data, type Duration, Effect, Exit } from "effect";

/** Allocate once when registering a handler, share concurrent lookups, and
 * never retain database failures. Re-running Cache.make per request defeats it.
 */
export function queryCache<P extends object, A, E>(
  lookup: (params: P) => Effect.Effect<A, E>,
  timeToLive: Duration.DurationInput,
  capacity = 200,
) {
  const cache = Effect.runSync(
    Cache.makeWith({
      capacity,
      lookup,
      timeToLive: (exit) => (Exit.isSuccess(exit) ? timeToLive : 0),
    }),
  );
  return (params: P) => {
    const key = Data.struct(params);
    return cache.get(key).pipe(Effect.tapError(() => cache.invalidate(key)));
  };
}
