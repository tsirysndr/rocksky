import { expect, test } from "bun:test";
import {
  createMetadataRequester,
  waitForMetadata,
} from "../src/lib/metadataRequests";

test("concurrent callers share one lane with at least 1.1 seconds between requests", async () => {
  let clock = 0;
  const started = [];
  let active = 0;
  const request = createMetadataRequester({
    userAgent: () => "Rocksky/test",
    now: () => clock,
    wait: async (ms) => {
      clock += ms;
    },
    fetchRequest: async (_, init) => {
      expect(active++).toBe(0);
      started.push(clock);
      expect(init.headers.get("User-Agent")).toBe("Rocksky/test");
      await Promise.resolve();
      active--;
      return Response.json({ ok: true });
    },
  });
  await Promise.all([
    request("acoustid"),
    request("musicbrainz"),
    request("coverart"),
  ]);
  expect(started).toEqual([0, 1100, 2200]);
});

test("429 Retry-After and MusicBrainz 503 delays apply before retrying", async () => {
  let clock = Date.parse("2026-01-01T00:00:00Z");
  const start = clock;
  const times = [];
  const request = createMetadataRequester({
    userAgent: () => "Rocksky/test",
    now: () => clock,
    wait: async (ms) => {
      clock += ms;
    },
    fetchRequest: async () => {
      times.push(clock - start);
      if (times.length === 1)
        return new Response("", {
          status: 429,
          headers: { "Retry-After": "5" },
        });
      if (times.length === 2)
        return new Response("", {
          status: 503,
          headers: { "Retry-After": new Date(start + 15000).toUTCString() },
        });
      return Response.json({ found: true });
    },
  });
  expect(await request("service")).toEqual({ found: true });
  expect(times).toEqual([0, 5000, 15000]);
});

test("retries are bounded and cooldown survives a failed track", async () => {
  let clock = 0;
  const times = [];
  const request = createMetadataRequester({
    userAgent: () => "Rocksky/test",
    now: () => clock,
    wait: async (ms) => {
      clock += ms;
    },
    fetchRequest: async () => {
      times.push(clock);
      return times.length <= 3
        ? new Response("", { status: 429 })
        : Response.json({});
    },
  });
  await expect(request("first")).rejects.toThrow("429");
  await request("second");
  expect(times).toEqual([0, 2000, 6000, 14000]);
});

test("cancelling a cooldown prevents a later network request", async () => {
  const controller = new AbortController();
  const waiting = waitForMetadata(60000, controller.signal);
  controller.abort();
  await expect(waiting).rejects.toThrow("cancelled");
  let calls = 0;
  const request = createMetadataRequester({
    userAgent: () => "Rocksky/test",
    fetchRequest: async () => {
      calls++;
      return Response.json({});
    },
  });
  await expect(request("service", {}, controller.signal)).rejects.toThrow(
    "cancelled",
  );
  expect(calls).toBe(0);
});
