import assert from "node:assert/strict";
import { test } from "node:test";
import { artworkUrl, clock, readTrack, snapshot } from "./receiver.ts";
const media = {
  contentId: "test",
  metadata: {
    title: "Get Lucky",
    artist: "Daft Punk",
    albumName: "Random Access Memories",
    images: [{ url: "https://example.com/cover.jpg" }],
  },
  duration: 369,
  customData: { rocksky: { source: "local" } },
};
test("CAF metadata becomes display data with local source and artwork", () => {
  assert.deepEqual(readTrack(media), {
    id: "test",
    title: "Get Lucky",
    artist: "Daft Punk",
    album: "Random Access Memories",
    artwork: "https://example.com/cover.jpg",
    duration: 369,
    source: "local",
  });
});
test("queue contains only tracks after the current item, including RN wire metadata", () => {
  const state = snapshot({
    playerState: "PLAYING",
    media,
    position: 15,
    duration: 369,
    index: 1,
    items: [
      { media },
      { media },
      { mediaInfo: { ...media, metadata: { title: "Next" } } },
    ],
  });
  assert.equal(state.queue.length, 1);
  assert.equal(state.queue[0].title, "Next");
  assert.equal(state.phase, "playing");
});
test("idle clears stale tracks; invalid or oversized positions are clamped", () => {
  assert.equal(
    snapshot({
      playerState: "IDLE",
      media,
      position: NaN,
      duration: 0,
      index: -1,
      items: [],
    }).track,
    null,
  );
  assert.equal(
    snapshot({
      playerState: "PAUSED",
      media,
      position: 999,
      duration: 369,
      index: 0,
      items: [],
    }).position,
    369,
  );
  assert.equal(readTrack(null), null);
  assert.equal(artworkUrl("javascript:alert(1)"), "");
});
test("clock supports unknown durations and hour-long mixes", () => {
  assert.equal(clock(NaN), "0:00");
  assert.equal(clock(126), "2:06");
  assert.equal(clock(3661), "1:01:01");
});
