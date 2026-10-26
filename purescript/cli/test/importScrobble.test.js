import { expect, mock, test } from "bun:test";
import { importScrobble } from "../runtime/lib/importScrobble.js";
const input = {
  title: "Good Riddance",
  artist: "Green Day",
  album: "Nimrod",
  timestamp: 15e8,
  source: "lastfm",
  mbId: "recording-id",
  isrc: "USRE19700529"
};
function failure(kind, status, message) {
  return Object.assign(new Error(message), { name: "RockskyError", kind, status });
}
test("published SDK matching misses import the original metadata", async () => {
  const agent = {
    scrobbleMatch: mock(async () => {
      throw failure("NotFound", 400, "No unambiguous song match");
    }),
    scrobble: mock(async () => "at://dry-run/scrobble/1")
  };
  await importScrobble(agent, input);
  expect(agent.scrobble).toHaveBeenCalledWith({
    title: input.title,
    artist: input.artist,
    album: input.album,
    albumArtist: input.artist,
    duration: 0,
    mbid: input.mbId,
    isrc: input.isrc,
    createdAt: "2017-07-14T02:40:00.000Z"
  });
});
test("a successful SDK call is not published again", async () => {
  const agent = { scrobbleMatch: mock(async () => "at://matched/1"), scrobble: mock(async () => "unexpected") };
  expect(await importScrobble(agent, input)).toBe("at://matched/1");
  expect(agent.scrobble).not.toHaveBeenCalled();
});
for (const error of [
  failure("NotFound", 400, "Record not found"),
  failure("NotEnoughResources", 503, "Request failed with status code 503"),
  failure("RateLimitExceeded", 429, "Too many requests"),
  failure("AuthRequired", 401, "Authentication required"),
  new Error("fetch failed")
]) {
  test(`does not hide ${error.message}`, async () => {
    const agent = {
      scrobbleMatch: mock(async () => {
        throw error;
      }),
      scrobble: mock(async () => "unexpected")
    };
    await expect(importScrobble(agent, input)).rejects.toBe(error);
    expect(agent.scrobble).not.toHaveBeenCalled();
  });
}
