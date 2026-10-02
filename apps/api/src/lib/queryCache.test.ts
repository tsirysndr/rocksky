import { expect, it } from "bun:test";
import { Effect } from "effect";
import { queryCache } from "./queryCache";

it("shares concurrent requests and retains a successful lookup by parameter value", async () => {
  let calls = 0;
  const get = queryCache(
    (params: { did: string; year: number }) =>
      Effect.promise(async () => {
        calls++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return params.year;
      }),
    "1 minute",
  );
  const params = { did: "test", year: 2025 };
  expect(
    await Promise.all(
      Array.from({ length: 5 }, () => Effect.runPromise(get({ ...params }))),
    ),
  ).toEqual([2025, 2025, 2025, 2025, 2025]);
  expect(await Effect.runPromise(get({ ...params }))).toBe(2025);
  expect(calls).toBe(1);
  await Effect.runPromise(get({ ...params, year: 2024 }));
  expect(calls).toBe(2);
});

it("retries a fresh request after a failed lookup instead of caching failure", async () => {
  let calls = 0;
  const get = queryCache(
    (_params: { did: string }) =>
      Effect.suspend(() =>
        ++calls === 1
          ? Effect.fail(new Error("database unavailable"))
          : Effect.succeed(42),
      ),
    "1 minute",
  );
  expect(
    await Effect.runPromiseExit(get({ did: "test" })).then((exit) => exit._tag),
  ).toBe("Failure");
  expect(await Effect.runPromise(get({ did: "test" }))).toBe(42);
  expect(calls).toBe(2);
});
