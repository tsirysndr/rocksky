import { expect, test } from "bun:test";
import { CastRequests } from "./castRequests";

test("Cast HTTP requests are serialized and paced at one per second", async () => {
  let now = 10000;
  const starts: number[] = [];
  let active = 0;
  let peak = 0;
  const requests = new CastRequests(
    async () => {
      starts.push(now);
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      return new Response(null);
    },
    () => now,
    async (ms) => {
      now += ms;
    },
  );
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      requests.fetch(`https://example.test/${i}`),
    ),
  );
  expect(peak).toBe(1);
  expect(starts).toHaveLength(20);
  expect(
    starts.every((start, i) => i === 0 || start - starts[i - 1] >= 1000),
  ).toBe(true);
});

test("429 retries honor Retry-After and Rocksky's reset TTL without bursting", async () => {
  let now = 0;
  const starts: number[] = [];
  const requests = new CastRequests(
    async () => {
      starts.push(now);
      if (starts.length === 1)
        return new Response(null, {
          status: 429,
          headers: { "Retry-After": "12" },
        });
      if (starts.length === 2)
        return new Response(null, {
          status: 429,
          headers: { "X-RateLimit-Reset": "30" },
        });
      return new Response(null);
    },
    () => now,
    async (ms) => {
      now += ms;
    },
  );
  expect((await requests.fetch("https://example.test/audio")).status).toBe(200);
  expect(starts).toEqual([0, 12000, 42000]);
});

test("cancelled queued requests do no HTTP work and don't block later requests", async () => {
  let now = 0;
  const urls: string[] = [];
  const requests = new CastRequests(
    async (url) => {
      urls.push(url);
      return new Response(null);
    },
    () => now,
    async (ms) => {
      now += ms;
    },
  );
  const cancelled = new AbortController();
  cancelled.abort();
  await expect(
    requests.fetch("cancelled", { signal: cancelled.signal }),
  ).rejects.toThrow("queue changed");
  await requests.fetch("selected");
  expect(urls).toEqual(["selected"]);
});
