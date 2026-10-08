import assert from "node:assert/strict";
import test from "node:test";
import { createRemoteEnqueue } from "./remoteEnqueue.ts";

test("remote enqueue loads the selected upload first and restores both sides of the queue", async () => {
  const requests: string[] = [],
    commands: any[] = [];
  let items: any[] = [];
  let nextId = 1;
  const enqueue = createRemoteEnqueue(
    () => "access-credential",
    (type, data) => {
      commands.push({ type, data });
      const incoming = (data.items as any[]).map((item) => ({
        ...item,
        itemId: nextId++,
      }));
      if (type === "QUEUE_LOAD") {
        assert.equal(requests.length, 2); // token + selected HEAD, no batch preparation
        items = incoming;
      } else {
        const before = items.findIndex(
          (item) => item.itemId === data.insertBefore,
        );
        items.splice(before < 0 ? items.length : before, 0, ...incoming);
      }
    },
    () => items,
    () => 0,
    {
      async fetch(url, init) {
        requests.push(url);
        if (new URL(url).pathname.endsWith("/stream-token")) {
          assert.equal(
            (init?.headers as any).authorization,
            "Bearer access-credential",
          );
          return Response.json({ token: "scoped-stream-token" });
        }
        assert.equal(init?.method, "HEAD");
        return new Response(null, {
          headers: { "content-type": "audio/flac" },
        });
      },
    },
  );
  await enqueue.enqueue({
    mode: "now",
    startIndex: 1,
    shuffle: false,
    tracks: [0, 1, 2].map((i) => ({
      uploadId: `upload-${i}`,
      title: `Track ${i}`,
      artist: "Artist",
    })),
  });
  assert.equal(commands[0].data.items[0].media.metadata.title, "Track 1");
  assert.deepEqual(
    items.map((item) => item.media.metadata.title),
    ["Track 0", "Track 1", "Track 2"],
  );
  assert.equal(JSON.stringify(commands).includes("access-credential"), false);
  assert.equal(commands[0].data.items[0].preloadTime, 20);
  enqueue.cancel();
});

test("a replacement queue cancels background inserts from the previous remote enqueue", async () => {
  let items: any[] = [];
  const commands: string[] = [];
  let heads = 0;
  const enqueue = createRemoteEnqueue(
    () => "credential",
    (type, data) => {
      commands.push(type);
      items = (data.items as any[]).map((item) => ({ ...item, itemId: 1 }));
    },
    () => items,
    () => 0,
    {
      async fetch(url) {
        if (new URL(url).pathname.endsWith("/stream-token"))
          return Response.json({ token: "scoped" });
        if (++heads === 2) items = [{ itemId: 999, media: {} }];
        return new Response(null, {
          headers: { "content-type": "audio/mpeg" },
        });
      },
    },
  );
  await enqueue.enqueue({
    mode: "now",
    startIndex: 0,
    shuffle: false,
    tracks: [0, 1, 2].map((i) => ({
      uploadId: String(i),
      title: "Track",
      artist: "Artist",
    })),
  });
  assert.deepEqual(commands, ["QUEUE_LOAD"]);
  assert.equal(heads, 2);
  enqueue.cancel();
});
