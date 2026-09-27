// Run against an isolated Redis: TEST_REDIS_SOCKET=/tmp/test.sock bun test ./tests/scrobbleDedup.integration.ts
import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { createClient } from "redis";
import { reserveScrobble } from "../src/lib/scrobbleDedup";

test("atomic scrobble reservation rejects racing retries and preserves repeat listens", async () => {
  if (!process.env.TEST_REDIS_SOCKET)
    throw new Error("Set TEST_REDIS_SOCKET to an isolated Redis socket");
  const redis = createClient({
    socket: { path: process.env.TEST_REDIS_SOCKET },
  });
  await redis.connect();
  const did = `test:${randomUUID()}`;
  const song = {
    title: "Woo",
    artist: "Beach House",
    timestamp: 1_800_000_059,
  };
  try {
    // Concurrent requests straddle a minute boundary and differ by 1–5s,
    // reproducing the production race that exact-timestamp locks missed.
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        reserveScrobble(
          redis,
          did,
          { ...song, timestamp: song.timestamp + (i % 6) },
          60,
        ),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(
      await reserveScrobble(
        redis,
        did,
        { ...song, title: "WOO", timestamp: song.timestamp - 5 },
        60,
      ),
    ).toBe(false);
    expect(
      await reserveScrobble(
        redis,
        did,
        { ...song, timestamp: song.timestamp + 300 },
        60,
      ),
    ).toBe(true);
    expect(await reserveScrobble(redis, `${did}:other`, song, 60)).toBe(true);
    expect(
      await reserveScrobble(
        redis,
        did,
        { ...song, artist: "Different artist" },
        60,
      ),
    ).toBe(true);
    // Historical imports must retain distinct short/repeated plays, including
    // out-of-order entries, while still rejecting exact duplicate timestamps.
    const imported = `${did}:import`;
    expect(await reserveScrobble(redis, imported, song, 0)).toBe(true);
    expect(
      await reserveScrobble(
        redis,
        imported,
        { ...song, timestamp: song.timestamp + 10 },
        0,
      ),
    ).toBe(true);
    expect(
      await reserveScrobble(
        redis,
        imported,
        { ...song, timestamp: song.timestamp - 10 },
        0,
      ),
    ).toBe(true);
    expect(await reserveScrobble(redis, imported, song, 0)).toBe(false);
    // Delimited metadata must not collide ("a|b", "c") vs ("a", "b|c").
    expect(
      await reserveScrobble(
        redis,
        did,
        { ...song, title: "a|b", artist: "c" },
        60,
      ),
    ).toBe(true);
    expect(
      await reserveScrobble(
        redis,
        did,
        { ...song, title: "a", artist: "b|c" },
        60,
      ),
    ).toBe(true);
    const keys = await redis.keys(`scrobble-window:v1:${did}*`);
    for (const key of keys) {
      const ttl = await redis.ttl(key);
      expect(ttl > 0 && ttl <= 300).toBe(true);
    }
  } finally {
    const keys = await redis.keys(`scrobble-window:v1:${did}*`);
    if (keys.length) await redis.del(keys);
    await redis.quit();
  }
});
