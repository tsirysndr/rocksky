import { expect, it } from "bun:test";
import { ownsRecord, putRecordOnce } from "./recordOwnership";

const DID = "did:plc:alice";

function fakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    async set(key: string, value: string, _options: { NX: true; EX: number }) {
      if (store.has(key)) return null;
      store.set(key, value);
      return "OK";
    },
    async del(key: string) {
      store.delete(key);
    },
  };
}

it("only counts a uri under the user's own DID as their record", () => {
  expect(ownsRecord(`at://${DID}/app.rocksky.artist/abc`, DID)).toBe(true);
  // The global row's uri, as publishScrobble stores it, belongs to whoever
  // published the artist first.
  expect(ownsRecord("at://did:plc:bob/app.rocksky.artist/abc", DID)).toBe(
    false,
  );
  expect(ownsRecord(null, DID)).toBe(false);
  expect(ownsRecord(undefined, DID)).toBe(false);
});

it("publishes once per identity while the claim is held", async () => {
  const redis = fakeRedis();
  let puts = 0;
  const put = async () => {
    puts++;
    return `at://${DID}/app.rocksky.artist/${puts}`;
  };

  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      putRecordOnce(redis, DID, "app.rocksky.artist", "sha-a", put),
    ),
  );

  expect(puts).toBe(1);
  expect(results.filter(Boolean)).toHaveLength(1);
  // A different identity, or another user, is not held back.
  await putRecordOnce(redis, DID, "app.rocksky.artist", "sha-b", put);
  await putRecordOnce(redis, "did:plc:bob", "app.rocksky.artist", "sha-a", put);
  expect(puts).toBe(3);
});

it("releases the claim when the put fails so a later scrobble retries", async () => {
  const redis = fakeRedis();
  let attempts = 0;

  const failed = await putRecordOnce(
    redis,
    DID,
    "app.rocksky.album",
    "sha",
    async () => {
      attempts++;
      return null;
    },
  );
  expect(failed).toBeNull();

  await expect(
    putRecordOnce(redis, DID, "app.rocksky.album", "sha", async () => {
      attempts++;
      throw new Error("pds down");
    }),
  ).rejects.toThrow("pds down");

  const uri = await putRecordOnce(
    redis,
    DID,
    "app.rocksky.album",
    "sha",
    async () => {
      attempts++;
      return `at://${DID}/app.rocksky.album/ok`;
    },
  );
  expect(uri).toBe(`at://${DID}/app.rocksky.album/ok`);
  expect(attempts).toBe(3);
  expect(redis.store.size).toBe(1);
});
