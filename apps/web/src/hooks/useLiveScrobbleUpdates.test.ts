import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { refreshScrobbleViews, startScrobbleUpdates } from "./useLiveScrobbleUpdates";

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: () => void;
  onerror?: () => void;
  send = vi.fn();
  constructor(_url: string) { Socket.instances.push(this); }
  open() { this.readyState = 1; this.onopen?.(); }
  message(data: string) { this.onmessage?.({ data }); }
  close() { this.readyState = 3; this.onclose?.(); }
}

let client: QueryClient;
let stop: (() => void) | undefined;
let visibility: string;
let listeners: Set<() => void>;

beforeEach(() => {
  vi.useFakeTimers();
  Socket.instances = [];
  visibility = "visible";
  listeners = new Set();
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("document", {
    get visibilityState() { return visibility; },
    addEventListener: (_name: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_name: string, listener: () => void) => listeners.delete(listener),
  });
  client = new QueryClient({ defaultOptions: { queries: {
    staleTime: Infinity, gcTime: Infinity, retry: false,
  } } });
});

afterEach(() => {
  stop?.();
  stop = undefined;
  client.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("refreshes feeds and profile history/counts for DID and handle aliases", async () => {
  const relevant = [
    ["infiniteFeed", "feed"], ["infiniteScrobbles", "viewer", true],
    ["scrobbles", "viewer"], ["stories"], ["scrobblesChart"], ["stats", "global"],
    ["profile", "stats", "did:plc:elias"],
    ["profile", "recent-tracks", "elias.rocksky.social", 0, 10],
  ];
  const unrelated = [["audio-settings"], ["profile", "did:plc:elias"]];
  for (const key of [...relevant, ...unrelated]) client.setQueryData(key, []);
  await refreshScrobbleViews(client);
  for (const key of relevant) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  for (const key of unrelated) expect(client.getQueryState(key)?.isInvalidated).toBe(false);
});

it("coalesces live bursts, ignores malformed frames, and reconnects with cleanup", async () => {
  const refresh = vi.spyOn(client, "invalidateQueries");
  stop = startScrobbleUpdates(client);
  const first = Socket.instances[0];
  first.message("pong");
  first.message("malformed");
  await vi.advanceTimersByTimeAsync(2000);
  expect(refresh).not.toHaveBeenCalled();
  for (let i = 0; i < 20; i++) first.message('{"did":"did:plc:elias"}');
  await vi.advanceTimersByTimeAsync(2000);
  expect(refresh).toHaveBeenCalledTimes(1);
  first.close();
  await vi.advanceTimersByTimeAsync(1000);
  expect(Socket.instances).toHaveLength(2);
  Socket.instances[1].open();
  await vi.advanceTimersByTimeAsync(2000);
  expect(refresh).toHaveBeenCalledTimes(2);
  stop();
  stop = undefined;
  expect(listeners.size).toBe(0);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(Socket.instances).toHaveLength(2);
});

it("recovers when a relay event arrives before indexing and pauses in hidden tabs", async () => {
  let indexed = false;
  const key = ["profile", "recent-tracks", "elias.rocksky.social"];
  client.setQueryData(key, []);
  const read = vi.fn(async () => indexed ? ["new play"] : []);
  const observer = new QueryObserver(client, { queryKey: key, queryFn: read });
  const unsubscribe = observer.subscribe(() => {});
  stop = startScrobbleUpdates(client);
  Socket.instances[0].open();
  await vi.advanceTimersByTimeAsync(2000);
  expect(client.getQueryData(key)).toEqual([]);
  indexed = true; // No second relay event is sent after the index commits.
  await vi.advanceTimersByTimeAsync(13_000);
  expect(client.getQueryData(key)).toEqual(["new play"]);
  expect(read).toHaveBeenCalledTimes(2);
  visibility = "hidden";
  await vi.advanceTimersByTimeAsync(30_000);
  expect(read).toHaveBeenCalledTimes(2);
  visibility = "visible";
  for (const listener of listeners) listener();
  await vi.advanceTimersByTimeAsync(2000);
  expect(read).toHaveBeenCalledTimes(3);
  unsubscribe();
});
