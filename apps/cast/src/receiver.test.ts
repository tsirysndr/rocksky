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

// Exercise the receiver's real event/update path with a large queue and an
// inaccurate sender clock; progress must not repeatedly walk the queue.
import { observeReceiver, type Player } from "./receiverUpdates.ts";
import type { ReceiverState } from "./receiver.ts";
function receiverHarness(queueSize = 10_000) {
  const events = Object.fromEntries(
    [
      "REQUEST_QUEUE_INSERT",
      "MEDIA_INFORMATION_CHANGED",
      "MEDIA_STATUS",
      "PAUSE",
      "BUFFERING",
      "ENDED",
      "EMPTIED",
      "PLAYING",
      "PLAYER_LOAD_COMPLETE",
      "PLAYER_LOADING",
      "TIME_UPDATE",
      "SEEKING",
      "SEEKED",
      "DURATION_CHANGE",
      "ERROR",
    ].map((key) => [key, key]),
  );
  const listeners = new Map<string, (event: unknown) => void>();
  let phase = "PLAYING";
  let queueReads = 0;
  let trackReads = 0;
  const item = {
    get media() {
      trackReads++;
      return media;
    },
  };
  const queue = Array(queueSize).fill(item);
  const audio = { readyState: 1, currentTime: 12.8, duration: 240.5 };
  const states: ReceiverState[] = [];
  const player: Player = {
    getMediaInformation: () => media,
    getCurrentTimeSec: () => 999,
    getDurationSec: () => 9999,
    getPlayerState: () => phase,
    getQueueManager: () => ({
      getItems: () => {
        queueReads++;
        return queue;
      },
      getCurrentItemIndex: () => 0,
    }),
    addEventListener: (type, listener) => {
      listeners.set(type, listener);
    },
    removeEventListener: (type) => {
      listeners.delete(type);
    },
    play() {},
    pause() {},
    seek() {},
  };
  const observer = observeReceiver(
    player,
    events,
    (state) => states.push(state),
    audio,
  );
  return {
    append: () => queue.push(item),
    audio,
    states,
    observer,
    listeners,
    emit: (event: string) => listeners.get(event)?.({}),
    setPhase: (value: string) => {
      phase = value;
    },
    counts: () => ({ queueReads, trackReads }),
  };
}
test("actual decoded audio supplies elapsed and total time; seeking updates without parsing the queue", () => {
  const h = receiverHarness();
  const initial = h.states.at(-1)!;
  assert.equal(initial.position, 12);
  assert.equal(initial.duration, 240.5);
  assert.equal(initial.queue.length, 3);
  assert.equal(initial.queueCount, 9999);
  assert.deepEqual(h.counts(), { queueReads: 1, trackReads: 3 });
  for (let i = 0; i < 60; i++) {
    h.audio.currentTime = 13 + i;
    h.emit("TIME_UPDATE");
  }
  assert.deepEqual(h.counts(), { queueReads: 1, trackReads: 3 });
  assert.equal(h.states.at(-1)!.queue, initial.queue);
  assert.equal(h.states.at(-1)!.track, initial.track);
  h.audio.currentTime = 20;
  h.emit("SEEKED");
  assert.equal(h.states.at(-1)!.position, 20);
  h.audio.duration = 245;
  h.emit("DURATION_CHANGE");
  assert.equal(h.states.at(-1)!.duration, 245);
  h.observer.dispose();
  assert.equal(h.listeners.size, 0);
});
test("paused/unchanged clock does not publish redraws; errors persist until playback recovers", () => {
  const h = receiverHarness();
  h.setPhase("PAUSED");
  h.emit("PAUSE");
  const count = h.states.length;
  for (let i = 0; i < 100; i++) h.observer.progress();
  assert.equal(h.states.length, count);
  h.emit("ERROR");
  h.emit("MEDIA_STATUS");
  assert.equal(h.states.at(-1)!.phase, "error");
  h.setPhase("PLAYING");
  h.emit("PLAYING");
  assert.equal(h.states.at(-1)!.phase, "playing");
  assert.equal(h.states.at(-1)!.error, undefined);
  h.setPhase("IDLE");
  h.emit("ENDED");
  assert.equal(h.states.at(-1)!.position, 0);
  assert.equal(h.states.at(-1)!.track, null);
  h.observer.dispose();
});
test("unknown player duration falls back to track metadata without dropping elapsed time", () => {
  const state = snapshot({
    playerState: "PLAYING",
    media,
    duration: 0,
    position: 20,
    items: [],
    index: -1,
  });
  assert.equal(state.duration, 369);
  assert.equal(state.position, 20);
});

test("background queue insertion updates Up next without a playback event", async () => {
  const h = receiverHarness(1);
  assert.equal(h.states.at(-1)!.queue.length, 0);
  h.emit("REQUEST_QUEUE_INSERT");
  h.append();
  h.append();
  h.append();
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(h.states.at(-1)!.queue.length, 3);
  assert.equal(h.states.at(-1)!.queueCount, 3);
  const count = h.states.length;
  h.observer.refresh();
  assert.equal(h.states.length, count);
  h.observer.dispose();
});
test("periodic refresh recovers queue changes without a request event", () => {
  const h = receiverHarness(1);
  h.append();
  h.observer.refresh();
  assert.equal(h.states.at(-1)!.queueCount, 1);
  h.observer.dispose();
});

import { queuePosition } from "./receiver.ts";
test("queue position uses full sender totals during progressive loading", () => {
  assert.deepEqual(queuePosition({ customData: { rocksky: { queuePosition: 12, queueTotal: 250 } } }, 0, 1),
    { queuePosition: 12, queueTotal: 250 });
  assert.deepEqual(queuePosition({}, 2, 8), { queuePosition: 3, queueTotal: 8 });
  assert.deepEqual(queuePosition({ customData: { rocksky: { queuePosition: -1, queueTotal: 0 } } }, 0, 1),
    { queuePosition: 1, queueTotal: 1 });
});
