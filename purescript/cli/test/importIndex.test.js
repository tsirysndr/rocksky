import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MemoryBlockstore, Repo, WriteOpAction, blocksToCarFile } from "@atproto/repo";
import { Secp256k1Keypair } from "@atproto/crypto";
import { ImportIndex } from "../runtime/lib/importIndex.js";
import { importScrobble, protectScrobbleWrites } from "../runtime/lib/importScrobble.js";
const did = "did:plc:importtest";
const collection = "app.rocksky.scrobble";
const secs = 15e8;
const record = { $type: collection, title: "Track", artist: "Artist", album: "", duration: 0, createdAt: new Date(secs * 1e3).toISOString() };
const cleanups = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function index() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "rocksky-import-dedup-"));
  const idx = new ImportIndex(dir);
  await idx.open();
  cleanups.push(async () => {
    await idx.close();
    await rm(dir, { recursive: true, force: true });
  });
  return idx;
}
async function snapshot(records) {
  const store = new MemoryBlockstore();
  const repo = await Repo.create(store, did, await Secp256k1Keypair.create(), records.map((r, i) => ({
    action: WriteOpAction.Create,
    collection,
    rkey: `record${i}`,
    record: r
  })));
  return blocksToCarFile(repo.cid, store.blocks);
}
test("repo hydration includes empty/missing albums and ignores album changes", async () => {
  const idx = await index();
  const { album, ...withoutAlbum } = record;
  const stats = await idx.indexCar(did, await snapshot([record, { ...withoutAlbum, title: "Other" }]));
  expect(stats.scrobbles).toBe(2);
  expect(await idx.scrobbleUri(did, " TRACK ", "artist", "Deluxe Edition", secs)).toBe(`at://${did}/${collection}/record0`);
  expect(await idx.scrobbleUri(did, "Other", "Artist", "Album", secs)).toBe(`at://${did}/${collection}/record1`);
  expect(await idx.scrobbleUri(did, "Track", "Artist", "", secs + 1)).toBeUndefined();
  expect(await idx.scrobbleUri(did, "Different track", "Artist", "", secs)).toBeUndefined();
  expect(await idx.scrobbleUri("did:plc:someoneelse", "Track", "Artist", "", secs)).toBeUndefined();
  await idx.indexCar(did, await snapshot([]));
  expect(await idx.scrobbleUri(did, "Track", "Artist", "", secs)).toBeUndefined();
});
test("live updates and deletion retain other copies of the same play", async () => {
  const idx = await index();
  await idx.applyCommit(did, collection, "create", "one", record);
  await idx.applyCommit(did, collection, "create", "two", record);
  await idx.applyCommit(did, collection, "delete", "one", void 0);
  expect(await idx.scrobbleUri(did, "Track", "Artist", "Other album", secs)).toBe(`at://${did}/${collection}/two`);
  await idx.applyCommit(did, collection, "update", "two", { ...record, title: "Changed" });
  expect(await idx.scrobbleUri(did, "Track", "Artist", "", secs)).toBeUndefined();
  expect(await idx.scrobbleUri(did, "Changed", "Artist", "", secs)).toBeDefined();
});
test("existing raw identity is skipped before song matching or publishing", async () => {
  const idx = await index();
  await idx.indexCar(did, await snapshot([record]));
  const unexpected = async () => {
    throw new Error("Must not call the network for a duplicate");
  };
  const uri = await importScrobble({ scrobble: unexpected, scrobbleMatch: unexpected }, {
    title: "Track",
    artist: "Artist",
    album: "New album",
    timestamp: secs,
    source: "spotify"
  }, { did, index: idx });
  expect(uri).toBe(`at://${did}/${collection}/record0`);
  expect(idx.duplicateHits).toBe(1);
});
test("matched identities serialize concurrent writes and skip metadata writes on duplicates", async () => {
  const idx = await index();
  let writes = 0;
  const agent = {
    did,
    scrobble: async (r) => {
      writes++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      const uri = `at://${did}/${collection}/new`;
      await idx.recordScrobble(did, r.title, r.artist, r.album, secs, uri);
      return uri;
    }
  };
  protectScrobbleWrites(agent, idx);
  const results = await Promise.all([agent.scrobble(record), agent.scrobble({ ...record, album: "Deluxe" })]);
  expect(results[0]).toBe(results[1]);
  expect(writes).toBe(1);
  expect(idx.duplicateHits).toBe(1);
});
test("a failed write stays retryable", async () => {
  const idx = await index();
  let writes = 0;
  const agent = { did, scrobble: async (_r) => {
    if (++writes === 1) throw new Error("PDS unavailable");
    return "at://success";
  } };
  protectScrobbleWrites(agent, idx);
  await expect(agent.scrobble(record)).rejects.toThrow("PDS unavailable");
  expect(await agent.scrobble(record)).toBe("at://success");
  expect(writes).toBe(2);
});
test("a canonical match already in the repo is skipped after raw metadata misses", async () => {
  const idx = await index();
  await idx.indexCar(did, await snapshot([record]));
  let writes = 0;
  const agent = {
    did,
    scrobble: async (_r) => {
      writes++;
      return "unexpected";
    },
    scrobbleMatch: async () => agent.scrobble({ ...record, album: "Another release" })
  };
  protectScrobbleWrites(agent, idx);
  const uri = await importScrobble(agent, {
    title: "Track (alternate spelling)",
    artist: "Artist",
    timestamp: secs,
    source: "spotify"
  }, { did, index: idx });
  expect(uri).toBe(`at://${did}/${collection}/record0`);
  expect(writes).toBe(0);
  expect(idx.duplicateHits).toBe(1);
});
