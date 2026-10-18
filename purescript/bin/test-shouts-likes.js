// Exercise compiled services with deterministic DB/PDS boundaries.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getTableName } from "drizzle-orm";
const envSource = await readFile(new URL("../api/src/Rocksky/Lib/Env.purs", import.meta.url), "utf8");
process.env.NODE_ENV = "test";
for (const [, name] of envSource.matchAll(/"([A-Z0-9_]+)": str required/g)) process.env[name] = "service-test";
const { fromAff } = await import("../output/Control.Promise/index.js");
const { Just, Nothing } = await import("../output/Data.Maybe/index.js");
const shouts = await import("../output/Rocksky.Shouts.Service/index.js");
const likes = await import("../output/Rocksky.Lovedtracks.Service/index.js");
const run = aff => fromAff(aff)();
const none = Nothing.value;
assert.deepEqual(shouts.shoutFields({ message: new Just(""), gif: none, facets: new Just([]) }), {});
assert.deepEqual(shouts.shoutFields({
  message: new Just("hello"), facets: none,
  gif: new Just({ url: "https://gif.test/image", previewUrl: none, alt: new Just("wave"), width: new Just(240), height: none }),
}), { message: "hello", gif: { url: "https://gif.test/image", alt: "wave", width: 240 } });
const stored = shouts.storageFields({ message: none, gif: none, facets: none });
assert.equal(stored.content, "");
assert.equal(stored.gifWidth, null);
assert.equal(stored.facets, null);

function database(responses) {
  const events = [], queue = [...responses];
  const build = (op, table) => {
    const event = { op, table: table && getTableName(table) };
    events.push(event);
    const b = {};
    for (const name of ["where", "limit", "offset", "orderBy", "innerJoin", "leftJoin", "returning", "onConflictDoNothing"]) {
      b[name] = (...args) => { event[name] = args; return b; };
    }
    b.from = table => { event.table = getTableName(table); return b; };
    b.values = fields => { event.fields = fields; return b; };
    b.set = fields => { event.fields = fields; return b; };
    b.execute = async () => {
      assert.ok(queue.length, "Unexpected DB operation " + event.op + " " + event.table);
      return queue.shift();
    };
    return b;
  };
  return {
    events,
    db: { select: () => build("select"), insert: t => build("insert", t), update: t => build("update", t), delete: t => build("delete", t) },
    done: () => assert.equal(queue.length, 0, "Unused DB response"),
  };
}
{
  const mock = database([[{ id: "owner" }, { id: "mentioned" }, { id: "actor" }], []]);
  const facets = new Just([
    { did: "did:plc:owner", byteStart: 0, byteEnd: 5 },
    { did: "did:plc:mentioned", byteStart: 6, byteEnd: 10 },
    { did: "did:plc:mentioned", byteStart: 11, byteEnd: 15 },
    { did: "did:plc:actor", byteStart: 16, byteEnd: 20 },
  ]);
  await run(shouts.notifyMentions({ db: mock.db })(facets)("actor")("shout")("at://subject")(["owner"]));
  mock.done();
  assert.deepEqual(mock.events.filter(e => e.op === "insert").map(e => e.fields[0].userId), ["mentioned"]);
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const query = new PgDialect().sqlToQuery(mock.events[0].where[0]);
  assert.deepEqual(query.params, ["did:plc:owner", "did:plc:mentioned", "did:plc:actor"]);
}

const user = { id: "user" };
const pdsDeletes = [];
const agent = { assertDid: "did:plc:caller", com: { atproto: { repo: { deleteRecord: async p => { pdsDeletes.push(p); } } } } };
{
  const mock = database([[{ id: "existing", uri: "at://did:plc:caller/app.rocksky.like/key" }]]);
  await run(shouts.likeShout({ db: mock.db })("at://did:plc:author/app.rocksky.shout/s")(user)({}));
  mock.done();
  assert.equal(mock.events.length, 1, "Duplicate reaction must not write or fetch a PDS record");
}
{
  const mock = database([[{ id: "reaction", uri: "at://did:plc:caller/app.rocksky.like/key" }], []]);
  await run(shouts.unlikeShout({ db: mock.db })("at://did:plc:author/app.rocksky.shout/s")(user)(agent));
  mock.done();
  assert.equal(mock.events[1].table, "shout_likes");
  assert.equal(pdsDeletes.pop().rkey, "key");
}
{
  const mock = database([[{ id: "track" }], [{ id: "liked", uri: "at://did:plc:caller/app.rocksky.like/key" }]]);
  await run(likes.unLikeTrack({ db: mock.db })("hash")(user)(agent));
  mock.done();
  assert.equal(mock.events.length, 2, "Record-backed likes await Jetstream for DB deletion");
  assert.equal(pdsDeletes.pop().collection, "app.rocksky.like");
}
{
  const date = new Date("2026-10-17T12:00:00Z");
  const mock = database([[{ id: "track" }], [{ id: "liked", uri: null, createdAt: date }], []]);
  const published = [];
  await run(likes.unLikeTrack({ db: mock.db, nc: { publish: (subject, bytes) => published.push([subject, JSON.parse(Buffer.from(bytes).toString())]) } })("hash")(user)(agent));
  mock.done();
  assert.equal(mock.events[2].op, "delete");
  assert.deepEqual(published, [["rocksky.unlike", { uri: null, user_id: { xata_id: "user" }, track_id: { xata_id: "track" }, xata_createdat: date.toISOString(), xata_id: "liked", xata_updatedat: date.toISOString(), xata_version: 0 }]]);
}
{
  const mock = database([[], [{ id: "track" }], [], [{ id: "artist" }], [], [{ id: "album" }], [], [], [], [], [], [], [{ uri: null }]]);
  const track = { title: "Song", artist: "Artist", album: "Album", albumArtist: "Artist", duration: 123, albumArt: null, mbId: null, trackNumber: 2, composer: null, lyrics: null, discNumber: null, releaseDate: null, year: null };
  assert.equal(await run(likes.likeTrack({ db: mock.db })(track)(user)({})), null);
  mock.done();
  assert.deepEqual(mock.events.filter(e => e.op === "insert").map(e => e.table), ["tracks", "artists", "albums", "album_tracks", "artist_tracks", "artist_albums"]);
  assert.equal(mock.events[1].fields[0].mbId, null);
  assert.equal("releaseDate" in mock.events[5].fields[0], false);
  assert.equal(mock.events.some(e => e.table === "loved_tracks"), false, "Only Jetstream creates loved_tracks");
}
console.log("Verified shout JSON, reaction idempotency, PDS/local unlike paths, metadata and junction writes.");

const { Lexicons } = await import("@atproto/lexicon");
const { loadLexicons } = await import("../output/Rocksky.Lexicon/index.js");
const records = await import("../output/Rocksky.Nowplaying.Records/index.js");
const lexicons = new Lexicons(await run(loadLexicons));
{
  const track = {
    title: "Song", artist: "Artist", album: "Album", albumArtist: "Artist", duration: 123,
    albumArt: null, artists: null, mbId: null, isrc: null, trackNumber: 0, discNumber: -2,
    composer: "", lyrics: "", copyrightMessage: null, spotifyLink: "", genres: null,
    artistPicture: null, releaseDate: null, year: null, timestamp: 1700000000,
  };
  const writes = [];
  const stored = new Map();
  const agent = { assertDid: "did:plc:caller", com: { atproto: { repo: {
    async putRecord(input) {
      writes.push(input);
      const data = { uri: "at://did:plc:caller/" + input.collection + "/" + input.rkey, cid: "unused", value: input.record };
      stored.set(input.rkey, data);
      if (input.swapRecord === null) throw new Error("lost ACK");
      return { data };
    },
    async getRecord({ rkey }) { return { data: stored.get(rkey) }; },
  } } } };
  const ctx = { lexicons };
  assert.ok(await run(records.putSongRecord(ctx)(track)(agent)));
  const song = writes[0];
  assert.equal(song.record.trackNumber, 1);
  assert.equal(song.record.discNumber, 1);
  assert.equal("lyrics" in song.record, false);
  assert.equal("swapRecord" in song, false);
  const uri = await run(records.putScrobbleRecord(ctx)(track)(agent)(new Just("durable-key")));
  assert.equal(uri, "at://did:plc:caller/app.rocksky.scrobble/durable-key");
  assert.equal(writes[1].swapRecord, null);
  assert.equal(writes[1].record.createdAt, "2023-11-14T22:13:20.000Z");
  await assert.rejects(run(records.putSongRecord(ctx)({ ...track, duration: -1 })(agent)), /Invalid record/);
}
console.log("Verified record lexicons, position normalization, timestamps and durable lost-ACK recovery.");

const { saveTrack } = await import("../output/Rocksky.Tracks.Service/index.js");
{
  const date = new Date("2026-10-18T00:00:00Z");
  const t = { id: "track", title: "Song", artist: "Artist", albumArtist: "Artist", album: "Album", albumArt: "https://art.test/a", uri: "at://repo/song/1", albumUri: "at://repo/album/1", artistUri: "at://repo/artist/1", sha256: "sha", createdAt: date, updatedAt: date };
  const a = { id: "album", uri: t.albumUri };
  const ar = { id: "artist", name: "Artist", uri: t.artistUri };
  const at = { id: "at", albumId: a.id, trackId: t.id, createdAt: date, updatedAt: date };
  const art = { id: "art", artistId: ar.id, trackId: t.id, createdAt: date, updatedAt: date };
  const aa = { id: "aa", artistId: ar.id, albumId: a.id, createdAt: date, updatedAt: date };
  const mock = database([[t], [ar], [a], [t], [a], [ar], [at], [art], [aa]]);
  const published = [];
  await run(saveTrack({ db: mock.db, nc: { publish: (subject, bytes) => published.push([subject, JSON.parse(Buffer.from(bytes).toString())]) } })({ ...t, albumArt: null })({}));
  mock.done();
  assert.equal(published.length, 1);
  const [subject, payload] = published[0];
  assert.equal(subject, "rocksky.track");
  assert.equal(payload.track.sha256, "sha");
  assert.equal(payload.track.xata_createdat, date.toISOString());
  assert.deepEqual(payload.album_track.album_id, { xata_id: "album" });
  assert.deepEqual(payload.artist_track.track_id, { xata_id: "track" });
  assert.deepEqual(payload.artist_album.artist_id, { xata_id: "artist" });
  assert.equal(mock.events.some(e => e.op !== "select"), false);
  const repairing = database([[t], [ar], [a], [t], [a], [ar], [], [], [], [], [], [], [t], [a], [ar], [at], [art], [aa]]);
  const repairedEvents = [];
  await run(saveTrack({ db: repairing.db, nc: { publish: (subject, bytes) => repairedEvents.push(subject) } })({ ...t, albumArt: null })({}));
  repairing.done();
  assert.deepEqual(repairing.events.filter(e => e.op === "insert").map(e => e.table), ["album_tracks", "artist_tracks", "artist_albums"]);
  assert.deepEqual(repairedEvents, ["rocksky.track"]);
  const bad = database([[t], [ar], [a], [{ ...t, artist: "Cannons", albumArtist: "Cannons" }], [a], [ar]]);
  await run(saveTrack({ db: bad.db })({ ...t, albumArt: null })({}));
  bad.done();
  assert.equal(bad.events.length, 6, "Wrong artist must stop before junction writes or publication");
}
console.log("Verified track persistence events and artist-credit guard.");
