import { RockskyTimeoutError } from "./errors";

/**
 * Compose async operators.
 *
 *   const handle = await pipe(
 *     () => client.actor.getProfile({ did }),  // thunk — withRetry can re-invoke
 *     withRetry(3),
 *     withTimeout(5_000),
 *     tap(p => console.log("got", p.handle)),
 *     map(p => p.handle.toUpperCase()),
 *   );
 *
 * `pipe` accepts either a thunk `() => Promise<T>` or a bare `Promise<T>`.
 * Operators take a factory so they can re-invoke the upstream chain (for
 * retry). If you pass a bare Promise, the work has already started and
 * `withRetry` becomes a no-op — pass a thunk if you want true retries.
 */
export type Op<A, B> = (factory: () => Promise<A>) => () => Promise<B>;

type AnyOp = Op<any, any>;
type Source<A> = Promise<A> | (() => Promise<A>);

export function pipe<A>(value: Source<A>): Promise<A>;
export function pipe<A, B>(value: Source<A>, op1: Op<A, B>): Promise<B>;
export function pipe<A, B, C>(
  value: Source<A>,
  op1: Op<A, B>,
  op2: Op<B, C>,
): Promise<C>;
export function pipe<A, B, C, D>(
  value: Source<A>,
  op1: Op<A, B>,
  op2: Op<B, C>,
  op3: Op<C, D>,
): Promise<D>;
export function pipe<A, B, C, D, E>(
  value: Source<A>,
  op1: Op<A, B>,
  op2: Op<B, C>,
  op3: Op<C, D>,
  op4: Op<D, E>,
): Promise<E>;
export function pipe<A, B, C, D, E, F>(
  value: Source<A>,
  op1: Op<A, B>,
  op2: Op<B, C>,
  op3: Op<C, D>,
  op4: Op<D, E>,
  op5: Op<E, F>,
): Promise<F>;
export function pipe(
  value: Source<unknown>,
  ...ops: AnyOp[]
): Promise<unknown> {
  let factory: () => Promise<unknown> =
    typeof value === "function" ? (value as () => Promise<unknown>) : () => value;
  for (const op of ops) factory = op(factory);
  return factory();
}

export function map<A, B>(fn: (a: A) => B | Promise<B>): Op<A, B> {
  return (factory) => async () => fn(await factory());
}

export function tap<A>(fn: (a: A) => unknown | Promise<unknown>): Op<A, A> {
  return (factory) => async () => {
    const a = await factory();
    await fn(a);
    return a;
  };
}

export function withRetry<A>(
  times: number,
  options: {
    delayMs?: number;
    factor?: number;
    shouldRetry?: (err: unknown, attempt: number) => boolean;
  } = {},
): Op<A, A> {
  const delayMs = options.delayMs ?? 200;
  const factor = options.factor ?? 2;
  const shouldRetry = options.shouldRetry ?? (() => true);
  return (factory) => async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= times; attempt++) {
      try {
        return await factory();
      } catch (err) {
        lastErr = err;
        if (attempt === times || !shouldRetry(err, attempt)) throw err;
        await sleep(delayMs * Math.pow(factor, attempt));
      }
    }
    throw lastErr;
  };
}

export function withTimeout<A>(ms: number): Op<A, A> {
  return (factory) => () =>
    new Promise<A>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new RockskyTimeoutError(ms)),
        ms,
      );
      factory().then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
}

export function withFallback<A>(fallback: A | ((err: unknown) => A | Promise<A>)): Op<A, A> {
  return (factory) => async () => {
    try {
      return await factory();
    } catch (err) {
      return typeof fallback === "function"
        ? await (fallback as (e: unknown) => A | Promise<A>)(err)
        : fallback;
    }
  };
}

export function catchError<A, B>(
  handler: (err: unknown) => B | Promise<B>,
): Op<A, A | B> {
  return (factory) => async () => {
    try {
      return await factory();
    } catch (err) {
      return await handler(err);
    }
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
