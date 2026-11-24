import { expect, test } from "bun:test";
import { Client, simpleFetchHandler } from "@atcute/client";

import { Agent } from "./agent.js";
import { RockskyError } from "./errors.js";

const did = "did:plc:mock";
const resetAt = 1800000000;

function mockAgent(handler: (request: Request) => Response | Promise<Response>) {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handler });
  const pds = server.url.origin;
  const rpc = new Client({ handler: simpleFetchHandler({ service: pds }) });
  // Bypass login only; writes use the real XRPC client and HTTP transport.
  const agent = new (Agent as unknown as new (...args: unknown[]) => Agent)(rpc, did, {}, pds);
  return { agent, close: () => server.stop(true) };
}

function quotaHeaders(remaining: number) {
  return {
    "ratelimit-limit": "5000",
    "ratelimit-remaining": String(remaining),
    "ratelimit-reset": String(resetAt),
    "ratelimit-policy": "5000;w=3600",
  };
}

test("HTTP mock PDS: write returns a quota object parsed from response headers", async () => {
  const requests: unknown[] = [];
  const { agent, close } = mockAgent(async request => {
    expect(request.method).toBe("POST");
    expect(new URL(request.url).pathname).toBe("/xrpc/com.atproto.repo.createRecord");
    requests.push(await request.json());
    // Quota exists exclusively in HTTP headers, never in the JSON body.
    return Response.json({ uri: `at://${did}/app.rocksky.artist/mock1` }, { headers: quotaHeaders(4997) });
  });
  try {
    const result = await agent.createArtist({ name: "Mock Artist" });
    expect(result).toEqual({
      uri: `at://${did}/app.rocksky.artist/mock1`, written: true,
      pdsWriteRateLimit: { limit: 5000, remaining: 4997, resetAt, policy: "5000;w=3600" },
    });
    expect(typeof result).toBe("object");
    expect(typeof result.pdsWriteRateLimit).toBe("object");
    expect(typeof result.pdsWriteRateLimit!.remaining).toBe("number");
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      repo: did, collection: "app.rocksky.artist",
      record: { $type: "app.rocksky.artist", name: "Mock Artist" },
    });
  } finally { close(); }
});

test("HTTP mock PDS: scrobble returns the quota after its final record write", async () => {
  const collections: string[] = [];
  const { agent, close } = mockAgent(async request => {
    const input = await request.json() as { collection: string };
    collections.push(input.collection);
    return Response.json({ uri: `at://${did}/${input.collection}/mock${collections.length}` }, {
      headers: quotaHeaders(5000 - 3 * collections.length),
    });
  });
  try {
    const result = await agent.scrobble({
      title: "Mock Song", artist: "Mock Artist", album: "Mock Album",
      albumArtist: "Mock Artist", duration: 180000,
    });
    expect(collections).toEqual([
      "app.rocksky.artist", "app.rocksky.album", "app.rocksky.song", "app.rocksky.scrobble",
    ]);
    expect(result).toEqual({
      uri: `at://${did}/app.rocksky.scrobble/mock4`, written: true,
      pdsWriteRateLimit: { limit: 5000, remaining: 4988, resetAt, policy: "5000;w=3600" },
    });
    expect(agent.pdsWriteRateLimit).toEqual(result.pdsWriteRateLimit);
  } finally { close(); }
});

test("HTTP mock PDS: rejected write preserves the exhausted quota as an object", async () => {
  const { agent, close } = mockAgent(() => Response.json({ error: "RateLimitExceeded" }, {
    status: 429, headers: quotaHeaders(0),
  }));
  try {
    let failure: unknown;
    try { await agent.delete("app.rocksky.artist", "mock1"); }
    catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(RockskyError);
    expect((failure as RockskyError).status).toBe(429);
    expect((failure as RockskyError).pdsWriteRateLimit).toEqual({
      limit: 5000, remaining: 0, resetAt, policy: "5000;w=3600",
    });
  } finally { close(); }
});
