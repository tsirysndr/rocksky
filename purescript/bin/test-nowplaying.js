import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const env = await readFile(new URL("../api/src/Rocksky/Lib/Env.purs", import.meta.url), "utf8");
process.env.NODE_ENV = "test";
for (const [, name] of env.matchAll(/"([A-Z0-9_]+)": str required/g)) process.env[name] = "nowplaying-test";
const { fromAff } = await import("../output/Control.Promise/index.js");
const { Just, Nothing } = await import("../output/Data.Maybe/index.js");
const { scrobbleTrack } = await import("../output/Rocksky.Nowplaying.Service/index.js");
const { loadLexicons } = await import("../output/Rocksky.Lexicon/index.js");
const { Lexicons } = await import("@atproto/lexicon");
const { getTableName } = await import("drizzle-orm");
const run = aff => fromAff(aff)();
const lexicons = new Lexicons(await run(loadLexicons));
const job = new Just({ id: "submission", rkey: "durable-rkey", skipTeal: true });
const none = Nothing.value;
const did = "did:plc:listener";
const uri = "at://" + did + "/app.rocksky.scrobble/durable-rkey";
const track = { title: "Submitted title", artist: "Submitted artist", albumArtist: "Submitted artist", album: "Submitted album", duration: 180000, timestamp: 1700000000 };
const invoke = (ctx, agent, submitted = track) => run(scrobbleTrack(ctx)(submitted)(agent)(did)(true)(none)(job));
const unreachable = new Proxy({}, { get: (_, key) => { throw new Error("Unexpected service access: " + String(key)); } });
{
  const agent = { com: { atproto: { repo: { getRecord: async () => ({ data: { uri } }) } } } };
  await invoke(unreachable, agent);
  await assert.rejects(invoke(unreachable, { com: { atproto: { repo: { getRecord: async () => { throw new Error("PDS unavailable"); } } } } }), /PDS unavailable/);
}
function scenario({ matching = "unmatched", reserve = true, duplicate = false, lostAck = false, catalog = false } = {}) {
  const existing = {
    ...track, id: "catalog-row", uri: "at://" + did + "/app.rocksky.song/song", albumUri: "at://repo/album/a", artistUri: "at://repo/artist/a",
    lyrics: "Only validated catalog may supply lyrics", trackNumber: 9, discNumber: 2, mbId: "catalog-mbid", albumArt: "https://catalog.test/a",
  };
  const album = { id: "album", year: 1998, releaseDate: "1998-04-20", albumArt: "https://album.test/a" };
  const responses = [[existing], [{ uri: existing.uri }], [album], [{ uri: "at://" + did + "/app.rocksky.artist/a" }], [{ uri: "at://" + did + "/app.rocksky.album/a" }], [existing], duplicate ? [{ id: "prior" }] : []];
  const calls = [], writes = [], reservations = [];
  const db = { select() {
    const b = {};
    for (const method of ["where", "limit", "orderBy", "innerJoin"]) b[method] = () => b;
    b.from = table => { calls.push(getTableName(table)); return b; };
    b.execute = async () => { assert.ok(responses.length, "Unexpected DB read"); return responses.shift(); };
    return b;
  } };
  const candidate = { source: catalog ? "catalog" : "spotify", id: catalog ? existing.id : "provider", title: "Provider title", artists: ["Provider artist"], identifiers: {}, durationMs: 200000, albumArt: "https://provider.test/a" };
  let published = false;
  const agent = { assertDid: did, com: { atproto: { repo: {
    async getRecord() { if (published) return { data: { uri } }; throw Object.assign(new Error("missing"), { error: "RecordNotFound" }); },
    async putRecord(input) { writes.push(input); published = true; if (lostAck) throw new Error("lost acknowledgement"); return { data: { uri, cid: "cid" } }; },
  } } } };
  const ctx = { db, lexicons,
    matching: { async post() {
      if (matching === "failure") throw new Error("matching unavailable");
      return { data: { policyVersion: "1", status: matching, track: matching === "matched" ? candidate : null, candidates: [{ track: candidate }] } };
    } },
    redis: { async eval(script, options) { reservations.push(options); return reserve ? 1 : 0; } },
  };
  return { ctx, agent, writes, calls, reservations, done: () => assert.equal(responses.length, 0) };
}
for (const matching of ["unmatched", "ambiguous", "failure", "matched"]) {
  const s = scenario({ matching, lostAck: matching === "matched" });
  await invoke(s.ctx, s.agent);
  s.done();
  assert.equal(s.writes.length, 1);
  const written = s.writes[0];
  assert.equal(written.collection, "app.rocksky.scrobble");
  assert.equal(written.swapRecord, null);
  assert.equal(written.rkey, "durable-rkey");
  assert.equal(written.record.title, track.title);
  assert.equal(written.record.artist, track.artist);
  assert.equal(written.record.duration, track.duration);
  assert.equal(written.record.lyrics, undefined, "A persistence lookup cannot enrich unvalidated recording metadata");
  assert.equal(written.record.year, 1998);
  assert.equal(written.record.createdAt, "2023-11-14T22:13:20.000Z");
  assert.deepEqual(s.reservations[0].arguments, ["1700000000", "0", "submission"]);
  assert.equal(s.calls.length, 7, "Durable submission must return before appview polling");
}
{
  const s = scenario({ matching: "matched", catalog: true });
  await invoke(s.ctx, s.agent);
  assert.equal(s.writes[0].record.lyrics, "Only validated catalog may supply lyrics");
  assert.equal(s.writes[0].record.trackNumber, 9);
}
{
  const s = scenario({ reserve: false });
  await assert.rejects(invoke(s.ctx, s.agent), /Another submission holds the dedup reservation/);
  assert.equal(s.writes.length, 0);
}
{
  const s = scenario({ duplicate: true });
  await invoke(s.ctx, s.agent);
  assert.equal(s.writes.length, 0);
  assert.equal(s.reservations.length, 0);
}
console.log("Verified durable recovery, matching fallback, catalog enrichment, duplicate recheck, reservation ownership and no post-publication polling.");

const { publishScrobble } = await import("../output/Rocksky.Nowplaying.Publication/index.js");
{
  const date = new Date("2026-10-18T00:00:00Z");
  const row = (id, extra = {}) => ({ id, createdAt: date, updatedAt: date, ...extra });
  const joined = {
    scrobble: row("scrobble", { timestamp: date, trackId: "track", albumId: "album", artistId: "artist", userId: "user" }),
    track: row("track", { sha256: "identity" }), album: row("album"), artist: row("artist"),
    user: row("user", { did, handle: "listener.test" }),
  };
  const tables = {
    scrobbles: [joined], user_albums: [], user_artists: [], user_tracks: [],
    album_tracks: [row("at", { albumId: "album", trackId: "track" })],
    artist_tracks: [row("art", { artistId: "artist", trackId: "track" })],
    artist_albums: [row("aa", { artistId: "artist", albumId: "album" })],
    feeds: [{ uri: "at://feed" }],
  };
  const inserted = [], events = [], invalidated = [], increments = [];
  const db = {
    select() {
      let table;
      const b = {};
      b.from = t => { table = getTableName(t); return b; };
      for (const method of ["where", "limit", "innerJoin"]) b[method] = () => b;
      b.execute = async () => { assert.ok(table in tables, table); return tables[table]; };
      return b;
    },
    insert(t) {
      const table = getTableName(t);
      return { values(values) { return { execute: async () => {
        inserted.push(table);
        tables[table] = [row(table + "-id", values[0])];
      } }; } };
    },
  };
  await run(publishScrobble({
    db,
    nc: { publish(subject, bytes) { events.push([subject, JSON.parse(Buffer.from(bytes).toString())]); } },
    redis: { async incr(key) { increments.push(key); return 1; }, async del(keys) { invalidated.push(keys); return 1; } },
  })("scrobble"));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(inserted, ["user_artists", "user_albums", "user_tracks"]);
  assert.deepEqual(events.map(([subject]) => subject), ["rocksky.scrobble", "rocksky.track"]);
  const body = events[0][1];
  assert.equal(body.scrobble.timestamp, date.toISOString());
  assert.equal(body.scrobble.track_id.sha256, "identity");
  assert.equal(body.scrobble.user_id.xata_id, "user");
  assert.deepEqual(body.user_track.user_id, { xata_id: "user" });
  assert.deepEqual(body.album_track.track_id, { xata_id: "track" });
  assert.ok(increments.includes("scrobbles:ver"));
  assert.ok(increments.includes("feed:ver:at://feed"));
  assert.equal(invalidated.length, 1);
}
console.log("Verified scrobble/track event ordering, relation creation, nested payloads and cache invalidation.");

const { remainingPlaybackMs } = await import("../output/Rocksky.Subscribers.Playback/index.js");
assert.equal(remainingPlaybackMs(null)(100), 0);
assert.equal(remainingPlaybackMs({ startedAt: 0, durationMs: 0 })(10), 0);
assert.equal(remainingPlaybackMs({ startedAt: 100, durationMs: 300 })(250), 150);
assert.equal(remainingPlaybackMs({ startedAt: 100, durationMs: 300 })(500), 0);
const { onNewUser } = await import("../output/Rocksky.Subscribers.User/index.js");
const { handle: handleTrack } = await import("../output/Rocksky.Subscribers.Track/index.js");
{
  const order = [];
  let index = 0;
  const messages = ["bad json", '{"xata_id":"first"}', '{"xata_id":"second"}'];
  let finish;
  const ended = new Promise(resolve => { finish = resolve; });
  const subscription = {
    [Symbol.asyncIterator]() { return this; },
    async next() {
      order.push("pull:" + index);
      if (index === messages.length) { finish(); return { done: true }; }
      return { done: false, value: { data: Buffer.from(messages[index++]) } };
    },
  };
  let selected = 0;
  onNewUser({
    nc: { subscribe(subject) { assert.equal(subject, "rocksky.user"); return subscription; } },
    db: { select() {
      const b = { from: () => b, where: () => b, execute: async () => [{ id: String(++selected), handle: "listener" }] };
      return b;
    } },
    typesense: { collections() { return { documents() { return {
      async import(docs) { order.push("start:" + docs[0].id); await new Promise(resolve => setTimeout(resolve, 5)); order.push("end:" + docs[0].id); return []; },
    }; } }; } },
  })();
  await ended;
  assert.deepEqual(order, ["pull:0", "pull:1", "start:1", "end:1", "pull:2", "start:2", "end:2", "pull:3"]);
}
{
  const collections = [];
  await run(handleTrack({
    db: { select() { let name; const b = { from: t => { name = getTableName(t); return b; }, where: () => b, execute: async () => [{ id: name, title: "Song" }] }; return b; } },
    typesense: { collections(name) { return { documents() { return { async import() { collections.push(name); if (name === "albums") throw Object.assign(new Error("forbidden"), { httpStatus: 403 }); return []; } }; } }; } },
  })({ track: { xata_id: "track" }, artist_album: { artist_id: { xata_id: "artist" }, album_id: { xata_id: "album" } } }));
  assert.deepEqual(collections.sort(), ["albums", "artists", "tracks"], "One index failure must not suppress the others");
}
console.log("Verified subscriber ordering, malformed-message isolation, independent indexing and playback expiry.");
