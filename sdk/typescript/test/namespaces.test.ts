import { describe, expect, it } from "bun:test";
import { createClient } from "../src";
import { lastUrl, mockFetch } from "./_mock";

function makeClient(fetchImpl: ReturnType<typeof mockFetch>["fetchImpl"]) {
  return createClient({
    fetch: fetchImpl,
    auth: "TOKEN",
    baseUrl: "https://api.test",
  });
}

describe("namespaces — query endpoints route correctly", () => {
  it.each([
    ["song.getSong", "app.rocksky.song.getSong", { uri: "at://x" }],
    ["song.matchSong", "app.rocksky.song.matchSong", { title: "t", artist: "a" }],
    ["artist.getArtist", "app.rocksky.artist.getArtist", { uri: "at://x" }],
    ["album.getAlbum", "app.rocksky.album.getAlbum", { uri: "at://x" }],
    ["stats.getStats", "app.rocksky.stats.getStats", { did: "did:plc:a" }],
    ["stats.getWrapped", "app.rocksky.stats.getWrapped", { did: "did:plc:a" }],
    ["feed.search", "app.rocksky.feed.search", { query: "x" }],
    [
      "charts.getTopArtists",
      "app.rocksky.charts.getTopArtists",
      { limit: 10 },
    ],
  ] as const)("%s → %s (GET)", async (path, nsid, params) => {
    const { fetchImpl, calls } = mockFetch();
    const client = makeClient(fetchImpl);
    const [ns, method] = path.split(".") as [string, string];
    // biome-ignore lint/suspicious/noExplicitAny: dynamic dispatch in test
    const fn = (client as any)[ns][method].bind((client as any)[ns]);
    await fn(params);
    const url = lastUrl(calls);
    expect(url.pathname).toBe(`/xrpc/${nsid}`);
    expect(calls[0]!.method).toBe("GET");
  });
});

describe("namespaces — procedures route correctly", () => {
  it("scrobble.createScrobble POSTs JSON body", async () => {
    const { fetchImpl, calls } = mockFetch();
    const c = makeClient(fetchImpl);
    await c.scrobble.createScrobble({ title: "Tiny Dancer", artist: "Elton John" });
    expect(calls[0]!.method).toBe("POST");
    expect(lastUrl(calls).pathname).toBe(
      "/xrpc/app.rocksky.scrobble.createScrobble",
    );
    expect(JSON.parse(calls[0]!.body!)).toEqual({
      title: "Tiny Dancer",
      artist: "Elton John",
    });
  });

  it("like.likeSong POSTs JSON body", async () => {
    const { fetchImpl, calls } = mockFetch();
    const c = makeClient(fetchImpl);
    await c.like.likeSong({ uri: "at://x" });
    expect(calls[0]!.method).toBe("POST");
    expect(JSON.parse(calls[0]!.body!)).toEqual({ uri: "at://x" });
  });

  it("graph.followAccount POSTs with query param", async () => {
    const { fetchImpl, calls } = mockFetch();
    const c = makeClient(fetchImpl);
    await c.graph.followAccount({ account: "alice.bsky.social" });
    expect(calls[0]!.method).toBe("POST");
    const url = lastUrl(calls);
    expect(url.pathname).toBe("/xrpc/app.rocksky.graph.followAccount");
    expect(url.searchParams.get("account")).toBe("alice.bsky.social");
  });

  it("player.seek POSTs with playerId & position", async () => {
    const { fetchImpl, calls } = mockFetch();
    const c = makeClient(fetchImpl);
    await c.player.seek({ playerId: "p1", position: 42 });
    const url = lastUrl(calls);
    expect(url.searchParams.get("playerId")).toBe("p1");
    expect(url.searchParams.get("position")).toBe("42");
  });

  it("mirror.putMirrorSource sends body", async () => {
    const { fetchImpl, calls } = mockFetch();
    const c = makeClient(fetchImpl);
    await c.mirror.putMirrorSource({
      provider: "lastfm",
      enabled: true,
      externalUsername: "alice",
    });
    expect(JSON.parse(calls[0]!.body!)).toEqual({
      provider: "lastfm",
      enabled: true,
      externalUsername: "alice",
    });
  });
});
