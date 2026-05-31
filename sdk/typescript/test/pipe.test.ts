import { describe, expect, it } from "bun:test";
import {
  RockskyTimeoutError,
  catchError,
  createClient,
  map,
  pipe,
  tap,
  withFallback,
  withRetry,
  withTimeout,
} from "../src";
import { mockFetch } from "./_mock";

describe("pipe", () => {
  it("returns the original value with no operators", async () => {
    const r = await pipe(Promise.resolve(42));
    expect(r).toBe(42);
  });

  it("maps the value", async () => {
    const r = await pipe(
      Promise.resolve({ name: "alice" }),
      map((u) => u.name.toUpperCase()),
    );
    expect(r).toBe("ALICE");
  });

  it("tap runs side-effect but passes value through", async () => {
    let seen: number | undefined;
    const r = await pipe(
      Promise.resolve(7),
      tap((n) => {
        seen = n;
      }),
      map((n) => n * 2),
    );
    expect(seen).toBe(7);
    expect(r).toBe(14);
  });

  it("withRetry retries failing operation", async () => {
    let n = 0;
    const r = await pipe(
      Promise.resolve(0),
      map(() => {
        n++;
        if (n < 3) throw new Error("nope");
        return n;
      }),
      withRetry(3, { delayMs: 1 }),
    );
    expect(r).toBe(3);
  });

  it("withRetry honors shouldRetry", async () => {
    let n = 0;
    await expect(
      pipe(
        Promise.resolve(0),
        map(() => {
          n++;
          throw new Error("fatal");
        }),
        withRetry(5, { delayMs: 1, shouldRetry: () => false }),
      ),
    ).rejects.toThrow("fatal");
    expect(n).toBe(1);
  });

  it("withTimeout rejects slow operations", async () => {
    await expect(
      pipe(
        new Promise((r) => setTimeout(() => r(1), 50)),
        withTimeout(10),
      ),
    ).rejects.toBeInstanceOf(RockskyTimeoutError);
  });

  it("withFallback returns a default on error", async () => {
    const r = await pipe(
      Promise.reject<number>(new Error("boom")),
      withFallback(99),
    );
    expect(r).toBe(99);
  });

  it("catchError transforms thrown errors", async () => {
    const r = await pipe(
      Promise.reject<string>(new Error("boom")),
      catchError((e) => `caught: ${(e as Error).message}`),
    );
    expect(r).toBe("caught: boom");
  });

  it("composes with a real client call (thunk for retry)", async () => {
    let attempts = 0;
    const { fetchImpl } = mockFetch(() => {
      attempts++;
      if (attempts < 2) return { status: 500, text: "x" };
      return { json: { handle: "alice" } };
    });
    const c = createClient({ fetch: fetchImpl });
    const handle = await pipe(
      () => c.actor.getProfile<{ handle: string }>({ did: "did:plc:a" }),
      withRetry(3, { delayMs: 1 }),
      withTimeout(1000),
      map((p) => p.handle),
    );
    expect(handle).toBe("alice");
    expect(attempts).toBe(2);
  });

  it("accepts a bare Promise for one-shot composition", async () => {
    const { fetchImpl } = mockFetch({ json: { handle: "bob" } });
    const c = createClient({ fetch: fetchImpl });
    const upper = await pipe(
      c.actor.getProfile<{ handle: string }>({ did: "did:plc:b" }),
      map((p) => p.handle.toUpperCase()),
    );
    expect(upper).toBe("BOB");
  });
});
