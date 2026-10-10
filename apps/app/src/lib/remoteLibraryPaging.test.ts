import { expect, test } from "bun:test";
import { RemoteLibraryPaging } from "./remoteLibraryPaging";

test("fast scroll during a refetch resumes without another end event", () => {
  const paging = new RemoteLibraryPaging();
  paging.scroll(9400, 600, 10000);
  paging.endReached();
  expect(paging.take(true, true, false)).toBe(false);
  expect(paging.take(true, false, false)).toBe(true);
  // Newly appended rows move the bottom away, stopping automatic requests.
  paging.contentSize(16000);
  expect(paging.take(true, false, false)).toBe(false);
});

test("short and duplicate pages keep loading while the bottom remains visible", () => {
  const paging = new RemoteLibraryPaging();
  paging.layout(600);
  paging.contentSize(200);
  expect(paging.take(true, false, false)).toBe(true);
  expect(paging.take(true, true, false)).toBe(false);
  paging.contentSize(200);
  expect(paging.take(true, false, false)).toBe(true);
  expect(paging.take(false, false, false)).toBe(false);
});

test("scrolling away cancels automatic demand and each folder starts fresh", () => {
  const paging = new RemoteLibraryPaging();
  paging.endReached();
  paging.scroll(0, 600, 10000);
  expect(paging.take(true, false, false)).toBe(false);
  expect(new RemoteLibraryPaging().take(true, false, false)).toBe(false);
});

test("errors do not spin; an explicit retry survives another active fetch", () => {
  const paging = new RemoteLibraryPaging();
  paging.endReached();
  expect(paging.take(true, false, true)).toBe(false);
  paging.request();
  expect(paging.take(true, true, true)).toBe(false);
  expect(paging.take(true, false, true)).toBe(true);
  expect(paging.take(true, false, true)).toBe(false);
});

test("prefetch starts a screen before the end without updating on every scroll", () => {
  const paging = new RemoteLibraryPaging();
  expect(paging.scroll(0, 600, 10000)).toBe(false);
  expect(paging.scroll(8800, 600, 10000)).toBe(true);
  expect(paging.scroll(9000, 600, 10000)).toBe(false);
  expect(paging.take(true, false, false)).toBe(true);
});
