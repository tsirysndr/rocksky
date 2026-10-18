import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
const source = await readFile(new URL("../api/src/Rocksky/Lib/Env.purs", import.meta.url), "utf8");
process.env.NODE_ENV = "test";
for (const [, key] of source.matchAll(/"([A-Z0-9_]+)": str required/g)) process.env[key] = "album-test";
const Albums = await import("../output/Rocksky.Xrpc.App.Rocksky.Album.GetAlbums/index.js");
const Album = await import("../output/Rocksky.Xrpc.App.Rocksky.Album.GetAlbum/index.js");
const Tracks = await import("../output/Rocksky.Xrpc.App.Rocksky.Album.GetAlbumTracks/index.js");
const { fromAff } = await import("../output/Control.Promise/index.js");
const { Nothing } = await import("../output/Data.Maybe/index.js");
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
const album = id => ({ id, uri: "at://did:plc:a/app.rocksky.album/" + id, title: id, artist: "Artist", artistUri: null, year: null, albumArt: null, releaseDate: null, sha256: id });
{
  const mock = mockDb([[{ albumId: "b", play_count: 9 }, { albumId: "a", play_count: 4 }], [album("a"), album("b")], [{ albumId: "a", unique_listeners: 2 }]]);
  const result = await run(Albums.retrieveAlbums(mock.db)({}));
  assert.deepEqual(result.data.map(a => [a.id, a.play_count, a.unique_listeners]), [["b", 9, 0], ["a", 4, 2]]);
  mock.done();
}
{
  const mock = mockDb([[], [album("unplayed"), album("other")], []], [[{ "QUERY PLAN": [{ Plan: { "Plan Rows": 3 } }] }], [{ id: "other" }, { id: "unplayed" }]]);
  const result = await run(Albums.retrieveAlbums(mock.db)({ filter: "artist==Artist", offset: 7, limit: 2 }));
  assert.deepEqual(result.data.map(a => [a.id, a.play_count]), [["other", 0], ["unplayed", 0]]);
  assert.ok(mock.queries.find(([kind, q]) => kind === "execute" && q.sql.includes("MATERIALIZED")));
  assert.ok(mock.queries.find(([kind, value]) => kind === "offset" && value === 0));
  mock.done();
}
{
  const mock = mockDb([], [[{ "QUERY PLAN": [{ Plan: { "Plan Rows": 0 } }] }], []]);
  assert.deepEqual(await run(Albums.retrieveAlbums(mock.db)({ filter: "title==Absent" })), { data: [] });
  mock.done();
}
const date = new Date("2026-10-18T00:00:00Z");
const track = (id, number, lyrics) => ({ id, title: id, discNumber: 1, trackNumber: number, lyrics, createdAt: date, updatedAt: date });
{
  const mock = mockDb([[{ tracks: track("first", 2, "") }, { tracks: track("replacement", 2, "lyrics") }, { tracks: track("second", 10, null) }]]);
  const tracks = await run(Tracks.retrieveTracks(mock.db)("at://did:plc:u/app.rocksky.album/a"));
  assert.deepEqual(tracks.map(t => t.id), ["replacement", "second"]);
  assert.equal("lyrics" in tracks[0], false);
  assert.equal(tracks[0].createdAt, date.toISOString());
  mock.done();
}
{
  const mock = mockDb([[]]);
  await assert.rejects(run(Album.getAlbum({ readDb: mock.db })("missing")(Nothing.value)), e => e.customErrorName === "NotFound");
  mock.done();
}
{
  const read = mockDb([[{ albums: { ...album("a"), createdAt: date, updatedAt: date }, artists: { genres: ["Rock"] }, discogs_releases: null }], [{ tracks: track("song", 1, "words") }], [{ count: 2 }], [{ count: 9 }]]);
  const primary = mockDb([[{ id: "song", sha256: "hash" }], [{ sha256: "hash", did: "did:plc:other" }]]);
  const result = await run(Album.getAlbum({ readDb: read.db, db: primary.db })(album("a").uri)(Nothing.value));
  assert.equal(result.playCount, 9);
  assert.equal(result.uniqueListeners, 2);
  assert.deepEqual(result.tags, ["Rock"]);
  assert.equal(result.tracks[0].likesCount, 1);
  assert.equal(result.tracks[0].liked, false);
  assert.equal("lyrics" in result.tracks[0], false);
  assert.equal(result.discogs, undefined);
  read.done(); primary.done();
}
console.log("Verified album rank/page order, unplayed filtered results, empty-page short circuit, lyric dedup, date serialization, not-found errors and anonymous likes.");
