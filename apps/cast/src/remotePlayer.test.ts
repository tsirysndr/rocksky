import assert from "node:assert/strict";
import test from "node:test";
import {
  attachRemotePlayer,
  remoteQueueItem,
  REMOTE_NAMESPACE,
  type RemoteReceiverPlayer,
} from "./remotePlayer.ts";
import type { RemotePlayer } from "@rocksky/sdk/remote";

test("receiver registers itself, publishes safe metadata, and routes remote queue and transport commands", () => {
  let listener: (event: { senderId: string; data: unknown }) => void = () => {};
  const commands: any[] = [],
    tracks: any[] = [],
    queues: any[] = [],
    statuses: string[] = [],
    replies: any[] = [];
  const handlers: Record<string, (...args: any[]) => void> = {};
  let connects = 0,
    disconnects = 0;
  let options: any;
  const fake = {
    id: "tv-device",
    on(event: string, fn: (...args: any[]) => void) {
      handlers[event] = fn;
      return this;
    },
    connect() {
      connects++;
    },
    disconnect() {
      disconnects++;
    },
    setNowPlaying(track: unknown) {
      tracks.push(track);
    },
    setQueue(queue: unknown, index: number) {
      queues.push({ queue, index });
    },
    setStatus(status: string) {
      statuses.push(status);
    },
  };
  const queue = [0, 1, 2].map((i) => ({
    itemId: 20 + i,
    media: {
      contentId: "https://files.example/music?token=secret",
      duration: 180,
      metadata: { title: `Track ${i}`, artist: "Artist", albumName: "Album" },
      customData: {
        rocksky: {
          source: "uploaded",
          track: { uploadId: `upload-${i}`, streamUrl: "secret" },
        },
      },
    },
  }));
  const player = {
    getQueueManager: () => ({
      getItems: () => queue,
      getCurrentItemIndex: () => 1,
    }),
    getMediaInformation: () => queue[1].media,
    getCurrentTimeSec: () => 5,
    getDurationSec: () => 180,
    getPlayerState: () => "PLAYING",
    sendLocalMediaRequest: (request: unknown) => commands.push(request),
    play: () => commands.push("play"),
    pause: () => commands.push("pause"),
    seek: (position: number) => commands.push(position),
  } as RemoteReceiverPlayer;
  const audio = { readyState: 1, currentTime: 25, duration: 181, volume: 0.6 };
  const dispose = attachRemotePlayer(
    {
      addCustomMessageListener: (namespace, fn) => {
        assert.equal(namespace, REMOTE_NAMESPACE);
        listener = fn;
      },
      removeCustomMessageListener() {},
      sendCustomMessage: (_namespace, _sender, message) =>
        replies.push(message),
    },
    player,
    audio,
    (opts) => {
      options = opts;
      return fake as unknown as RemotePlayer;
    },
  );
  try {
    listener({ senderId: "sender", data: "bad json" });
    assert.equal(connects, 0);
    listener({
      senderId: "sender",
      data: { type: "authorize", token: "credential", name: "Salon TV" },
    });
    assert.equal(connects, 1);
    assert.equal(options.name, "Salon TV");
    assert.equal(options.token(), "credential");
    assert.equal(tracks[0].title, "Track 1");
    assert.equal(tracks[0].elapsedMs, 25000);
    assert.equal(tracks[0].durationMs, 181000);
    assert.equal(queues[0].queue.length, 3);
    assert.equal(queues[0].index, 1);
    assert.equal(
      JSON.stringify([tracks, queues, replies]).includes("secret"),
      false,
    );
    assert.equal(
      JSON.stringify([tracks, queues, replies]).includes("credential"),
      false,
    );
    listener({
      senderId: "sender",
      data: JSON.stringify({
        type: "authorize",
        token: "credential",
        name: "Salon TV",
      }),
    });
    assert.equal(connects, 1);
    assert.equal(queues.length, 1);
    handlers.play();
    handlers.pause();
    handlers.seek(42000);
    assert.deepEqual(commands, ["play", "pause", 42]);
    handlers.next();
    handlers.previous();
    handlers.queueJump(2);
    handlers.queueRemove(0);
    handlers.queueMove(0, 2);
    assert.equal(commands[3].jump, 1);
    assert.equal(commands[4].jump, -1);
    assert.equal(commands[5].currentItemId, 22);
    assert.deepEqual(commands[6].itemIds, [20]);
    assert.equal(commands[7].type, "QUEUE_REORDER");
    assert.equal(commands[7].insertBefore, undefined);
    const count = commands.length;
    handlers.queueJump(-1);
    handlers.queueRemove(999);
    handlers.queueMove(0, NaN);
    assert.equal(commands.length, count);
    handlers.setVolume(2);
    assert.equal(audio.volume, 1);
    handlers.setVolume(NaN);
    assert.equal(audio.volume, 1);
    listener({ senderId: "other", data: { type: "disconnect" } });
    assert.equal(disconnects, 0);
    listener({ senderId: "sender", data: { type: "disconnect" } });
    assert.equal(disconnects, 1);
    assert.equal(options.token(), undefined);
  } finally {
    dispose();
  }
});

test("local queue metadata never exposes file capabilities or pretends to be an upload", () => {
  const item = remoteQueueItem({
    contentId: "http://phone/file/secret",
    metadata: {
      title: "Local track",
      artist: "Artist",
      images: [{ url: "http://phone/art/secret" }],
    },
    customData: {
      rocksky: { source: "local", track: { uploadId: "local-id" } },
    },
  });
  assert.equal(item.uploadId, undefined);
  assert.equal(item.albumArt, undefined);
  assert.equal(JSON.stringify(item).includes("secret"), false);
});
