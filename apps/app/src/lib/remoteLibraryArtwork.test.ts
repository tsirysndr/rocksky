import { expect, test } from "bun:test";
import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import type { LibraryPage } from "../api/remoteLibraries";
import { refreshRemoteArtwork } from "./remoteLibraryArtwork";

const key = ["remote-library", "server", "tracks", ""];
const page: LibraryPage = {
  entries: [{ id: "track", kind: "track", title: "Song", artist: "Singer",
    album: "Album", durationMs: 100, art: "http://server/missing.jpg" }],
  nextOffset: 100,
};
const cover: LibraryPage = { ...page, entries: [{ ...page.entries[0], art: "file:///cache/cover.img" }] };
function setup() {
  const cache = new QueryClient();
  cache.setQueryData(key, { pages: [page], pageParams: [0] });
  return cache;
}
function data(cache: QueryClient) {
  return cache.getQueryData<InfiniteData<LibraryPage, number>>(key)!;
}

test("local cache refresh replaces a broken UPnP URL without a revision prerequisite", async () => {
  const cache = setup();
  await refreshRemoteArtwork(cache, key, "server", async () => cover, () => false);
  expect(data(cache).pages[0].entries[0].art).toBe("file:///cache/cover.img");
  expect(data(cache).pageParams).toEqual([0]);
  expect(data(cache).pages[0].nextOffset).toBe(100);
});

test("a failed read can recover on the next tick even without a new revision", async () => {
  const cache = setup();
  await expect(refreshRemoteArtwork(cache, key, "server", async () => {
    throw new Error("Cache busy");
  }, () => false)).rejects.toThrow("Cache busy");
  await refreshRemoteArtwork(cache, key, "server", async () => cover, () => false);
  expect(data(cache).pages[0]).toEqual(cover);
});

test("appended pages survive an in-flight artwork read", async () => {
  const cache = setup();
  const next = { entries: [], nextOffset: null };
  await refreshRemoteArtwork(cache, key, "server", async () => {
    cache.setQueryData(key, { pages: [page, next], pageParams: [0, 100] });
    return cover;
  }, () => false);
  expect(data(cache).pages).toEqual([cover, next]);
  expect(data(cache).pageParams).toEqual([0, 100]);
});

test("cancellation and replaced pages discard stale results", async () => {
  const cache = setup();
  let cancelled = false;
  await refreshRemoteArtwork(cache, key, "server", async () => {
    cancelled = true;
    return cover;
  }, () => cancelled);
  expect(data(cache).pages[0]).toEqual(page);
  const replacement = { ...page, entries: [] };
  await refreshRemoteArtwork(cache, key, "server", async () => {
    cache.setQueryData(key, { pages: [replacement], pageParams: [0] });
    return cover;
  }, () => false);
  expect(data(cache).pages[0]).toEqual(replacement);
});

test("artwork polling leaves pagination running and refreshes after it finishes", async () => {
  const cache = setup();
  let finish!: (value: InfiniteData<LibraryPage, number>) => void;
  let calls = 0;
  const next = { entries: [], nextOffset: null };
  const fetching = cache.fetchQuery({ queryKey: key, queryFn: () =>
    new Promise<InfiniteData<LibraryPage, number>>((resolve) => { finish = resolve; }) });
  const read = async (_source: string, current: LibraryPage) => {
    calls++;
    return current.entries.length ? cover : current;
  };
  await refreshRemoteArtwork(cache, key, "server", read, () => false);
  expect(calls).toBe(1); // Still resumes the worker while the server is busy.
  expect(cache.getQueryState(key)?.fetchStatus).toBe("fetching");
  expect(data(cache).pages[0]).toEqual(page);
  finish({ pages: [page, next], pageParams: [0, 100] });
  await fetching;
  await refreshRemoteArtwork(cache, key, "server", read, () => false);
  expect(data(cache).pages).toEqual([cover, next]);
});
