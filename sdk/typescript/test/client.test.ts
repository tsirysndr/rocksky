import { describe, expect, it } from "bun:test";
import {
  RockskyAuthError,
  RockskyClient,
  RockskyHttpError,
  RockskyTimeoutError,
  createClient,
} from "../src";
import { lastUrl, mockFetch } from "./_mock";

describe("RockskyClient", () => {
  it("uses default base url when none provided", () => {
    const c = new RockskyClient();
    expect(c.config.baseUrl).toBe("https://api.rocksky.app");
  });

  it("strips trailing slash from base url", () => {
    const c = new RockskyClient({ baseUrl: "https://example.com/" });
    expect(c.config.baseUrl).toBe("https://example.com");
  });

  it("builds XRPC URL with namespace, method and query params", async () => {
    const { fetchImpl, calls } = mockFetch({ json: { handle: "alice" } });
    const c = createClient({
      baseUrl: "https://api.example",
      fetch: fetchImpl,
    });
    const r = await c.actor.getProfile({ did: "did:plc:abc" });
    expect(r).toEqual({ handle: "alice" });
    const url = lastUrl(calls);
    expect(url.pathname).toBe("/xrpc/app.rocksky.actor.getProfile");
    expect(url.searchParams.get("did")).toBe("did:plc:abc");
  });

  it("serializes array params with repeated keys", async () => {
    const { fetchImpl, calls } = mockFetch();
    const c = createClient({ fetch: fetchImpl });
    await c.graph.getFollowers({
      actor: "alice.bsky.social",
      dids: ["did:plc:1", "did:plc:2"],
    });
    const url = lastUrl(calls);
    expect(url.searchParams.getAll("dids")).toEqual([
      "did:plc:1",
      "did:plc:2",
    ]);
  });

  it("serializes boolean as 'true'/'false'", async () => {
    const { fetchImpl, calls } = mockFetch();
    const c = createClient({ fetch: fetchImpl });
    await c.scrobble.getScrobbles({ following: true });
    const url = lastUrl(calls);
    expect(url.searchParams.get("following")).toBe("true");
  });

  it("omits null/undefined params", async () => {
    const { fetchImpl, calls } = mockFetch();
    const c = createClient({ fetch: fetchImpl });
    await c.album.getAlbums({ limit: 10, genre: undefined });
    const url = lastUrl(calls);
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.has("genre")).toBe(false);
  });

  it("sends procedures as POST with JSON body", async () => {
    const { fetchImpl, calls } = mockFetch({ json: { ok: true } });
    const c = createClient({ fetch: fetchImpl, auth: "TOKEN" });
    await c.scrobble.createScrobble({
      title: "Heart of Glass",
      artist: "Blondie",
    });
    const last = calls[calls.length - 1]!;
    expect(last.method).toBe("POST");
    expect(last.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(last.body!)).toEqual({
      title: "Heart of Glass",
      artist: "Blondie",
    });
  });

  it("attaches bearer token from string auth", async () => {
    const { fetchImpl, calls } = mockFetch();
    const c = createClient({ fetch: fetchImpl, auth: "abc123" });
    await c.actor.getProfile();
    expect(calls[0]!.headers.authorization).toBe("Bearer abc123");
  });

  it("resolves async auth provider", async () => {
    const { fetchImpl, calls } = mockFetch();
    let count = 0;
    const c = createClient({
      fetch: fetchImpl,
      auth: async () => {
        count++;
        return `tok-${count}`;
      },
    });
    await c.actor.getProfile();
    await c.actor.getProfile();
    expect(calls[0]!.headers.authorization).toBe("Bearer tok-1");
    expect(calls[1]!.headers.authorization).toBe("Bearer tok-2");
  });

  it("throws RockskyAuthError if requireAuth without token", async () => {
    const { fetchImpl } = mockFetch();
    const c = createClient({ fetch: fetchImpl });
    await expect(c.scrobble.createScrobble({ title: "x", artist: "y" })).rejects.toBeInstanceOf(
      RockskyAuthError,
    );
  });

  it("withAuth returns a new client without mutating the original", async () => {
    const { fetchImpl, calls } = mockFetch();
    const c = createClient({ fetch: fetchImpl });
    const authed = c.withAuth("Z");
    await authed.actor.getProfile();
    await expect(c.scrobble.createScrobble({ title: "x", artist: "y" })).rejects.toBeInstanceOf(
      RockskyAuthError,
    );
    expect(calls[0]!.headers.authorization).toBe("Bearer Z");
  });

  it("throws RockskyHttpError on non-2xx with parsed body", async () => {
    const { fetchImpl } = mockFetch({ status: 404, json: { error: "nope" } });
    const c = createClient({ fetch: fetchImpl });
    try {
      await c.album.getAlbum({ uri: "at://x" });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(RockskyHttpError);
      const e = err as RockskyHttpError;
      expect(e.status).toBe(404);
      expect(e.body).toEqual({ error: "nope" });
    }
  });

  it("retries on 503 and succeeds", async () => {
    let n = 0;
    const { fetchImpl, calls } = mockFetch(() => {
      n++;
      if (n < 3) return { status: 503, text: "down" };
      return { json: { ok: true } };
    });
    const c = createClient({
      fetch: fetchImpl,
      retries: 3,
      retryDelayMs: 1,
    });
    const r = await c.actor.getProfile();
    expect(r).toEqual({ ok: true });
    expect(calls.length).toBe(3);
  });

  it("does not retry on 4xx", async () => {
    const { fetchImpl, calls } = mockFetch({ status: 400, json: {} });
    const c = createClient({
      fetch: fetchImpl,
      retries: 3,
      retryDelayMs: 1,
    });
    await expect(c.actor.getProfile()).rejects.toBeInstanceOf(RockskyHttpError);
    expect(calls.length).toBe(1);
  });

  it("times out and throws RockskyTimeoutError", async () => {
    const { fetchImpl } = mockFetch({ delayMs: 50, json: {} });
    const c = createClient({ fetch: fetchImpl, timeoutMs: 10 });
    await expect(c.actor.getProfile()).rejects.toBeInstanceOf(RockskyTimeoutError);
  });

  it("xrpc escape hatch hits arbitrary endpoint", async () => {
    const { fetchImpl, calls } = mockFetch({ json: { ok: true } });
    const c = createClient({ fetch: fetchImpl });
    await c.xrpc("app.rocksky.feed.search", "GET", {
      params: { query: "blondie" },
    });
    const url = lastUrl(calls);
    expect(url.pathname).toBe("/xrpc/app.rocksky.feed.search");
    expect(url.searchParams.get("query")).toBe("blondie");
  });
});
