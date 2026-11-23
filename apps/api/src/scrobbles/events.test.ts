import { describe, expect, test } from "bun:test";
import { ScrobbleEvents, scrobbleChange, scrobbleEventsApp } from "./events";

const uri = "at://did:plc:listener/app.rocksky.scrobble/abc";
const commit = (operation: string) => ({
  kind: "commit",
  did: "did:plc:listener",
  commit: {
    collection: "app.rocksky.scrobble",
    rkey: "abc",
    operation,
  },
});

describe("Jetstream scrobble SSE", () => {
  test("accepts scrobble creates, updates and deletes, ignoring other collections", () => {
    for (const op of ["create", "update", "delete"]) {
      expect(scrobbleChange(commit(op))).toEqual({
        uri,
        deleted: op === "delete",
      });
    }
    expect(
      scrobbleChange({ ...commit("create"), kind: "identity" }),
    ).toBeNull();
    expect(
      scrobbleChange({
        ...commit("create"),
        commit: {
          ...commit("create").commit,
          collection: "app.bsky.feed.post",
        },
      }),
    ).toBeNull();
    expect(scrobbleChange(null)).toBeNull();
  });

  test("waits for indexing then broadcasts one shared snapshot to all clients", async () => {
    let indexed = false;
    let reads = 0;
    const events = new ScrobbleEvents({
      feed: async () => {
        reads++;
        return [{ uri, title: "Song" }];
      },
      existing: async () => new Set(indexed ? [uri] : []),
    });
    const first: string[] = [],
      second: string[] = [];
    events.subscribe((frame) => first.push(frame));
    events.subscribe((frame) => second.push(frame));
    events.change(scrobbleChange(commit("create"))!);
    await events.flush();
    expect(reads).toBe(0);
    indexed = true;
    await events.flush();
    expect(reads).toBe(1);
    expect(first).toEqual(second);
    expect(first[0]).toContain('"title":"Song"');
    events.refresh();
    await events.flush();
    expect(first).toHaveLength(1); // No duplicate animations on reconnect refresh.
    events.stop();
  });

  test("coalesces bursts and publishes deletions after the index removes them", async () => {
    let indexed = true;
    const events = new ScrobbleEvents({
      feed: async () => (indexed ? [{ uri }] : []),
      existing: async () => new Set(indexed ? [uri] : []),
    });
    const frames: string[] = [];
    events.subscribe((frame) => frames.push(frame));
    events.change({ uri, deleted: false });
    events.change({ uri, deleted: false });
    await events.flush();
    expect(frames).toHaveLength(1);
    events.change({ uri, deleted: true });
    await events.flush();
    expect(frames).toHaveLength(1);
    indexed = false;
    await events.flush();
    expect(frames[1]).toContain('"scrobbles":[]');
    events.stop();
  });

  test("does not replace a good snapshot on DB failure and retries recovery", async () => {
    let fail = false;
    const events = new ScrobbleEvents({
      feed: async () => {
        if (fail) throw new Error("offline");
        return [{ uri }];
      },
      existing: async () => new Set(),
    });
    const frames: string[] = [];
    events.subscribe((frame) => frames.push(frame));
    events.upstreamConnected = true;
    events.refresh();
    await events.flush();
    expect(events.healthy).toBe(true);
    fail = true;
    events.refresh();
    await events.flush();
    expect(events.healthy).toBe(false);
    expect(frames).toHaveLength(1);
    fail = false;
    await events.flush();
    expect(events.healthy).toBe(true);
    events.stop();
  });

  test("serves named SSE frames, heartbeats, CORS, and releases aborted clients", async () => {
    const events = new ScrobbleEvents({
      feed: async () => [{ uri }],
      existing: async () => new Set(),
    });
    events.refresh();
    await events.flush();
    const abort = new AbortController();
    const response = await scrobbleEventsApp(events, () => {}, 5).request(
      "/events/scrobbles",
      { signal: abort.signal },
    );
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    expect(decoder.decode((await reader.read()).value)).toContain(
      "retry: 3000",
    );
    expect(decoder.decode((await reader.read()).value)).toContain(
      "event: scrobbles",
    );
    expect(decoder.decode((await reader.read()).value)).toContain(
      '"healthy":false',
    );
    expect(events.clients).toBe(1);
    abort.abort();
    expect(events.clients).toBe(0);
    await reader.cancel();
    events.stop();
  });
});

test("standalone SSE root serves the Rocksky SSE banner as plain text", async () => {
  const { banner, scrobblesStreamApp } = await import("./stream-app");
  const events = new ScrobbleEvents({
    feed: async () => [],
    existing: async () => new Set(),
  });
  const app = scrobblesStreamApp(events);
  const response = await app.request("/");
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/plain");
  expect(await response.text()).toBe(banner);
  expect(banner).toContain(
    String.raw`  / /_/ / __ \/ ___/ //_/ ___/ //_/ / / /   \__ \\__ \/ __/`,
  );
  expect((await app.request("/health")).status).toBe(503);
  events.upstreamConnected = true;
  events.databaseHealthy = true;
  expect((await app.request("/health")).status).toBe(200);
  events.stop();
});
