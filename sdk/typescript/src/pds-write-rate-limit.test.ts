import { describe, expect, test } from "bun:test";
import { Agent } from "./agent.js";
import { RockskyError } from "./errors.js";
import { parsePdsWriteRateLimit } from "./pds-write-rate-limit.js";

function headers(remaining = "4997", policy = "5000;w=3600") {
  return new Headers({ "ratelimit-policy": policy, "ratelimit-limit": policy.split(";")[0]!,
    "ratelimit-remaining": remaining, "ratelimit-reset": "1800000000" });
}

function fake(responses: Array<{ ok: boolean; headers?: Headers; status?: number; data?: unknown }>) {
  const calls: string[] = [];
  const rpc = { async post(nsid: string) {
    calls.push(nsid);
    return { data: { uri: "at://did:plc:test/record/key" }, ...responses.shift()! };
  } };
  const agent = new (Agent as unknown as new (...args: unknown[]) => Agent)(rpc, "did:plc:test", {}, "https://pds.test");
  return { agent, calls };
}

describe("PDS write points", () => {
  test("recognizes hourly and daily budgets, including exhausted quotas", () => {
    expect(parsePdsWriteRateLimit(headers())?.remaining).toBe(4997);
    expect(parsePdsWriteRateLimit(headers("0", "35000;w=86400"))).toEqual({
      limit: 35000, remaining: 0, resetAt: 1800000000, policy: "35000;w=86400" });
  });
  test("rejects request quotas, unknown policies, missing or malformed fields", () => {
    expect(parsePdsWriteRateLimit(headers("2999", "3000;w=300"))).toBeNull();
    expect(parsePdsWriteRateLimit(headers("9999", "10000;w=3600"))).toBeNull();
    for (const value of ["", "NaN", "-1", "1.5", "5001", "9007199254740992"]) {
      expect(parsePdsWriteRateLimit(headers(value))).toBeNull();
    }
    const missing = headers(); missing.delete("ratelimit-reset");
    expect(parsePdsWriteRateLimit(missing)).toBeNull();
    const mismatch = headers(); mismatch.set("ratelimit-limit", "3000");
    expect(parsePdsWriteRateLimit(mismatch)).toBeNull();
  });
  test("scrobble retains the final quota after all four writes", async () => {
    const { agent, calls } = fake([4997, 4994, 4991, 4988].map(n => ({ ok: true, headers: headers(String(n)) })));
    expect(agent.pdsWriteRateLimit).toBeNull();
    const uri = await agent.scrobble({ title: "Song", artist: "Artist", album: "Album", albumArtist: "Artist", duration: 180000 });
    expect(uri.uri).toBe("at://did:plc:test/record/key");
    expect(calls).toHaveLength(4);
    expect(uri.pdsWriteRateLimit?.remaining).toBe(4988);
    expect(agent.pdsWriteRateLimit?.remaining).toBe(4988);
  });
  test("put and delete capture quotas; missing headers clear the snapshot", async () => {
    const { agent } = fake([{ ok: true, headers: headers() }, { ok: true, headers: headers("4996") }, { ok: true }]);
    // Use the common upsert path without depending on a particular singleton record.
    await (agent as any).putRecord("app.rocksky.artist", "key", { name: "Artist" });
    expect(agent.pdsWriteRateLimit?.remaining).toBe(4997);
    await agent.delete("app.rocksky.artist", "key");
    expect(agent.pdsWriteRateLimit?.remaining).toBe(4996);
    await agent.createArtist({ name: "Other" });
    expect(agent.pdsWriteRateLimit).toBeNull();
  });
  test("429 preserves the response's exhausted write budget on the error", async () => {
    const { agent } = fake([{ ok: false, status: 429, headers: headers("0"), data: { error: "RateLimitExceeded" } }]);
    try { await agent.delete("app.rocksky.artist", "key"); throw new Error("expected failure"); }
    catch (error) {
      expect(error).toBeInstanceOf(RockskyError);
      expect((error as RockskyError).pdsWriteRateLimit?.remaining).toBe(0);
      expect((error as RockskyError).status).toBe(429);
    }
    expect(agent.pdsWriteRateLimit?.remaining).toBe(0);
  });
});
