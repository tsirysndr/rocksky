import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
const source = await readFile(new URL("../api/src/Rocksky/Lib/Env.purs", import.meta.url), "utf8");
process.env.NODE_ENV = "test";
for (const [, key] of source.matchAll(/"([A-Z0-9_]+)": str required/g)) process.env[key] = "album-test";
const Catalog = await import("../output/Rocksky.Xrpc.App.Rocksky.Artist.GetArtists/index.js");
const Detail = await import("../output/Rocksky.Xrpc.App.Rocksky.Artist.GetArtist/index.js");
const Tracks = await import("../output/Rocksky.Xrpc.App.Rocksky.Artist.GetArtistTracks/index.js");
const Albums = await import("../output/Rocksky.Xrpc.App.Rocksky.Artist.GetArtistAlbums/index.js");
const Listeners = await import("../output/Rocksky.Xrpc.App.Rocksky.Artist.GetArtistListeners/index.js");
const Recent = await import("../output/Rocksky.Xrpc.App.Rocksky.Artist.GetArtistRecentListeners/index.js");
const { fromAff } = await import("../output/Control.Promise/index.js");
const run = aff => fromAff(aff)();
const dialect = new PgDialect();
function mockDb(responses, raw = []) {
  const queries = [];
  const db = {
    select() {
      const q = {};
      for (const key of ["from", "innerJoin", "leftJoin", "where", "orderBy", "groupBy", "limit", "offset"]) q[key] = value => {
        queries.push([key, key === "where" ? dialect.sqlToQuery(value) : value]); return q;
      };
      q.getSQL = () => sql.raw('select xata_id as id, xata_createdat as created_at from albums');
      q.execute = async () => { assert.ok(responses.length); return responses.shift(); };
      return q;
    },
    async execute(statement) { queries.push(["execute", dialect.sqlToQuery(statement)]); assert.ok(raw.length); return { rows: raw.shift() }; },
  };
  return { db, queries, done() { assert.equal(responses.length, 0); assert.equal(raw.length, 0); } };
}
const date = new Date("2026-10-18T00:00:00Z");
const artist = { id: "a", name: "Sälen", genres: null, createdAt: date, updatedAt: date };
const listener = id => ({ id, did: "did:plc:" + id, handle: id + ".test", displayName: null, avatar: "" });
for (const module of [Listeners, Recent, Albums, Tracks]) {
  const mock = mockDb([[]]);
  const ctx = module === Recent ? { db: mock.db } : { readDb: mock.db };
  const arg = module === Albums ? "missing" : { uri: "missing" };
  assert.deepEqual(await run(module.retrieve(ctx)(arg)), []);
  mock.done();
}
{
  const mock = mockDb([[artist], [{ userId: null, totalArtistPlays: 100 }, { userId: "missing", totalArtistPlays: 99 }, { userId: "u", totalArtistPlays: 30 }], [listener("u")],
    [{ userId: "u", title: "First", uri: null, plays: 10 }, { userId: "u", title: "Tied", uri: "tie", plays: 10 }, { userId: null, title: "Ignored", plays: 100 }]]);
  const result = await run(Listeners.retrieve({ readDb: mock.db })({ uri: "artist", offset: 20 }));
  assert.equal(result.length, 1);
  assert.equal(result[0].rank, 23, "Filtered-out rows still occupy their rank");
  assert.equal(result[0].displayName, "");
  assert.deepEqual(result[0].mostListenedSong, { title: "First", uri: "", playCount: 10 });
  assert.equal(result[0].totalPlays, 30);
  mock.done();
}
{
  const mock = mockDb([[artist], [{ userId: "u", lastTimestamp: date }, { userId: "v", lastTimestamp: null }], [listener("u"), listener("v")],
    [{ userId: "u", uri: "first", timestamp: date }, { userId: "u", uri: "tie", timestamp: date }, { userId: "u", uri: "old", timestamp: new Date(0) }]]);
  const result = await run(Recent.retrieve({ db: mock.db })({ uri: "artist" }));
  assert.equal(result.length, 1);
  assert.equal(result[0].timestamp, date.toISOString());
  assert.equal(result[0].scrobbleUri, "first");
  mock.done();
}
{
  const mock = mockDb([[{ artists: null }]]);
  await assert.rejects(run(Detail.retrieve({ readDb: mock.db })("artist")), e => e.customErrorName === "NotFound");
  mock.done();
}
{
  const mock = mockDb([[{ artists: artist }], [{ count: 4 }], [{ count: 30 }]]);
  const result = await run(Detail.retrieve({ readDb: mock.db })("artist"));
  assert.equal(result.uniqueListeners, 4);
  assert.equal(result.playCount, 30);
  assert.equal(result.updatedAt, date.toISOString());
  mock.done();
}
{
  const mock = mockDb([[artist], [{ albumId: "b" }, { albumId: "a" }], [{ id: "a", title: "A" }, { id: "b", title: "B" }], [{ albumId: "b", play_count: 5, unique_listeners: 3 }]]);
  const result = await run(Albums.retrieve({ readDb: mock.db })("artist"));
  assert.deepEqual(result.map(a => [a.id, a.playCount]), [["a", 0], ["b", 5]]);
  mock.done();
}
const track = id => ({ id, title: id, artist: "Sälen", albumArtist: "Sälen", createdAt: date, duration: 120 });
{
  const mock = mockDb([[artist], [{ trackId: "popular", play_count: 10, unique_listeners: 4 }],
    [{ trackId: "wrong", artist: "Cannons", albumArtist: "Cannons" }, { trackId: "unplayed", artist: "SÄLEN", albumArtist: "" }],
    [track("unplayed"), track("popular")]]);
  const result = await run(Tracks.retrieve({ readDb: mock.db })({ uri: "artist", limit: 2, offset: 0 }));
  assert.deepEqual(result.map(t => [t.id, t.playCount]), [["popular", 10], ["unplayed", 0]]);
  assert.ok(mock.queries.find(([key, value]) => key === "where" && value.sql.includes("not exists")));
  mock.done();
}
{
  const mock = mockDb([[artist], [], [{ trackId: "played" }],
    [{ trackId: "wrong", artist: "Other", albumArtist: "" }, { trackId: "u0", artist: "Salen", albumArtist: "" }, { trackId: "u1", artist: "Salen", albumArtist: "" }, { trackId: "u2", artist: "Salen", albumArtist: "" }],
    [track("u1"), track("u2")]]);
  const result = await run(Tracks.retrieve({ readDb: mock.db })({ uri: "artist", limit: 2, offset: 2 }));
  assert.deepEqual(result.map(t => t.id), ["u1", "u2"], "Credit filter runs before unplayed offset");
  mock.done();
}
{
  const mock = mockDb([[{ artistId: "b", play_count: 1 }, { artistId: "a", play_count: 100 }], [{ ...artist, id: "a" }, { ...artist, id: "b" }], [{ artistId: "a", play_count: 100, unique_listeners: 2 }]]);
  const result = await run(Catalog.retrieveArtists(mock.db)({}));
  assert.deepEqual(result.map(a => a.id), ["b", "a"]);
  assert.deepEqual(result[0].genres, []);
  const ordering = mock.queries.find(([key]) => key === "orderBy")[1];
  assert.ok(dialect.sqlToQuery(ordering).sql.includes("count(DISTINCT"));
  mock.done();
}
{
  const mock = mockDb([[artist], []], [[{ "QUERY PLAN": [{ Plan: { "Plan Rows": 1 } }] }], [{ id: "a" }]]);
  const result = await run(Catalog.retrieveArtists(mock.db)({ names: " Sälen, , Other ", genre: "Rock", filter: "genres==Rock" }));
  assert.equal(result[0].playCount, 0);
  const condition = mock.queries.find(([key]) => key === "where")[1];
  assert.deepEqual(condition.params, ["Sälen", "Other", "Rock", "Rock"]);
  mock.done();
}
console.log("Verified artist details/catalog/albums, listener rank gaps and ties, timestamp serialization, played-first paging, Unicode credit filtering and unplayed offsets.");
const Loved = await import("../output/Rocksky.Xrpc.App.Rocksky.Actor.GetActorLovedSongs/index.js");
{
  const lovedAt = new Date("2026-10-19T00:00:00Z");
  const mock = mockDb([[{ tracks: { ...track("song"), lyrics: "words", updatedAt: date }, lovedAt }]]);
  const result = await run(Loved.retrieve({ db: mock.db })({ did: "listener.test" }));
  assert.equal(result[0].createdAt, lovedAt.toISOString());
  assert.equal(result[0].updatedAt, date.toISOString());
  assert.equal(result[0].lyrics, undefined);
  assert.equal(result[0].acoustidFingerprint, undefined);
  const condition = mock.queries.find(([key]) => key === "where")[1];
  assert.ok(condition.sql.includes("is not null"));
  assert.deepEqual(condition.params, ["listener.test", "listener.test"]);
  mock.done();
}
console.log("Verified loved-song handle lookup, published-record filtering and love-time timestamp without lyrics or audio fingerprints.");
