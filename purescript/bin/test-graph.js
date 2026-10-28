import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PgDialect } from "drizzle-orm/pg-core";
import { Lexicons } from "@atproto/lexicon";
const source = await readFile(new URL("../api/src/Rocksky/Lib/Env.purs", import.meta.url), "utf8");
process.env.NODE_ENV = "test";
for (const [, key] of source.matchAll(/"([A-Z0-9_]+)": str required/g)) process.env[key] = "graph-test";
const C = await import("../output/Rocksky.Xrpc.App.Rocksky.Graph.Common/index.js");
const K = await import("../output/Rocksky.Xrpc.App.Rocksky.Graph.GetKnownFollowers/index.js");
const M = await import("../output/Rocksky.Xrpc.App.Rocksky.Graph.Mutations/index.js");
const { fromAff } = await import("../output/Control.Promise/index.js");
const { Just, Nothing } = await import("../output/Data.Maybe/index.js");
const { pure } = await import("../output/Control.Applicative/index.js");
const { applicativeAff } = await import("../output/Effect.Aff/index.js");
const { loadLexicons } = await import("../output/Rocksky.Lexicon/index.js");
const run = aff => fromAff(aff)();
const lexicons = new Lexicons(await run(loadLexicons));
const dialect = new PgDialect();
const date = new Date("2026-10-18T00:00:00Z");
const viewer = { id: "v", did: "did:plc:viewer", handle: "viewer.test", displayName: "Viewer", avatar: "", createdAt: date, updatedAt: date };
const subject = { ...viewer, id: "s", did: "did:plc:subject", handle: "subject.test" };
function mockDb(responses) {
  const calls = [];
  const db = {
    async execute(query) { calls.push(["execute", dialect.sqlToQuery(query)]); assert.ok(responses.length, "Unexpected query"); return { rows: responses.shift() }; },
    select() {
      const q = {};
      for (const name of ["from", "where", "leftJoin", "innerJoin", "limit", "orderBy"]) q[name] = value => { if (name === "where") calls.push(["where", dialect.sqlToQuery(value)]); return q; };
      q.execute = async () => { assert.ok(responses.length, "Unexpected select"); return responses.shift(); };
      return q;
    },
    insert() {
      const q = {
        values(v) { calls.push(["insert", v]); return q; },
        onConflictDoNothing() { calls.push(["conflict"]); return q; },
        returning() { return q; },
        async execute() { return []; },
      };
      return q;
    },
    delete() {
      const q = { where() { return q; }, async execute() { calls.push(["delete"]); } };
      return q;
    },
  };
  return { db, calls, done() { assert.equal(responses.length, 0); } };
}
for (const followers of [false, true]) {
  const mock = mockDb([[{subject:{...subject,createdAt:date.toISOString(),updatedAt:date.toISOString()},profiles:[{...viewer,createdAt:date.toISOString(),updatedAt:date.toISOString()}],cursor:String(date.getTime()),count:9}]]);
  const result = await run(C.retrieve(followers)({ db: mock.db })({ actor: subject.did, cursor: "1792368000000", dids: [viewer.did] }));
  assert.equal(result.subject.createdAt, date.toISOString());
  assert.equal(result[followers ? "followers" : "follows"][0].did, viewer.did);
  assert.equal(result.cursor, String(date.getTime()));
  assert.equal(result.count, 9);
  assert.equal(mock.calls.length,1);
  const query=mock.calls[0][1];
  assert.match(query.sql,/WITH page AS/);
  assert.match(query.sql,/count\(\*\)::int FROM follows f WHERE/);
  assert.equal(query.params.filter(p=>p instanceof Date).length,1,"Cursor only filters the page, not the count");
  mock.done();
}
{
  const mock = mockDb([[{subject:{},profiles:[],cursor:null,count:0}]]);
  const result = await run(C.retrieve(true)({ db: mock.db })({ actor: subject.did, cursor: "1", dids: [] }));
  assert.deepEqual(result.subject, {});
  assert.equal(result.cursor, undefined);
  assert.equal(mock.calls.length,1);
  assert.equal(mock.calls[0][1].params.includes(false),false,"Empty dids must not suppress the page cursor");
  mock.done();
}
{
  const mock = mockDb([[subject], [{ users: viewer, follows: { createdAt: date } }]]);
  const result = await run(K.retrieve(mock.db)({ actor: subject.did })(viewer.did));
  assert.equal(result.followers[0].did, viewer.did);
  assert.equal(result.cursor, String(date.getTime()));
  const condition = mock.calls.find(([key, q]) => key === "where" && q.sql.includes("EXISTS"))[1];
  assert.deepEqual(condition.params, [subject.did, viewer.did]);
  mock.done();
}
const noAgent = () => () => pure(applicativeAff)(Nothing.value);
await assert.rejects(run(M.mutateWithAgent(true)({})(subject.did)(Nothing.value)(noAgent)), /not authenticated/);
await assert.rejects(run(M.mutateWithAgent(true)({})(viewer.did)(new Just(viewer.did))(noAgent)), /themselves/);
for (const follow of [false, true]) {
  const mock = mockDb([follow ? [{ id: "already" }] : []]);
  await assert.rejects(run(M.mutateWithAgent(follow)({ db: mock.db })(subject.did)(new Just(viewer.did))(noAgent)), follow ? /already following/ : /not following/);
  mock.done();
}
for (const follow of [false, true]) {
  for (const failure of [false, true]) {
    const existing = { uri: "at://" + viewer.did + "/app.rocksky.graph.follow/old" };
    const responses = follow ? [[]] : [[existing], [existing]];
    if (!failure) responses.push([subject], [{ users: viewer }], ...(follow ? [[{ id: viewer.id }]] : []));
    const mock = mockDb(responses);
    const agent = { assertDid: viewer.did, com: { atproto: { repo: {
      async createRecord(input) {
        mock.calls.push(["pds-create", input]);
        if (failure) throw new Error("PDS rejected");
        return { data: { uri: existing.uri, cid: "cid" } };
      },
      async deleteRecord(input) {
        mock.calls.push(["pds-delete", input]);
        if (failure) throw new Error("PDS rejected");
      },
    } } } };
    const action = M.mutateWithAgent(follow)({ db: mock.db, lexicons })(subject.did)(new Just(viewer.did))(() => () => pure(applicativeAff)(new Just(agent)));
    if (failure) {
      await assert.rejects(run(action), /PDS rejected/);
      assert.equal(mock.calls.some(([key]) => key === "insert" || key === "delete"), false);
    } else {
      const result = await run(action);
      assert.equal(result.subject.did, subject.did);
      assert.equal(result.followers.length, 1);
      if (follow) {
        const input = mock.calls.find(([key]) => key === "pds-create")[1];
        assert.equal(input.record.subject, subject.did);
        assert.equal(input.validate, false);
        const writes = mock.calls.filter(([key]) => key === "insert").map(([, values]) => values[0]);
        assert.equal(writes[0].follower_did, viewer.did);
        assert.equal(writes[1].userId, subject.id);
        assert.equal(writes[1].actorId, viewer.id);
        assert.equal(writes[1].subjectUri, "at://" + viewer.did);
      } else {
        assert.equal(mock.calls.find(([key]) => key === "pds-delete")[1].rkey, "old");
        assert.equal(result.cursor, undefined);
      }
    }
    mock.done();
  }
}
console.log("Verified graph direction/filter/cursor/count semantics, mutual-follow SQL, guards, PDS-before-index mutations and notification identities.");
const Playlists = await import("../output/Rocksky.Xrpc.App.Rocksky.Actor.GetActorPlaylists/index.js");
const { drizzle } = await import("drizzle-orm/node-postgres");
{
  const queries = [];
  const db = drizzle({ query: async (config, values) => {
    queries.push({ sql: typeof config === "string" ? config : config.text, values });
    return { rows: [] };
  } });
  const params = { did: viewer.did, limit: 20, offset: 0 };
  assert.deepEqual(await run(Playlists.retrieveActorPlaylists(db)({ ...params, filter: 'track.artist=="Daft Punk";track.title==Around*' })), []);
  assert.match(queries[0].sql, /exists \(select/i);
  assert.ok(queries[0].values.includes("Daft Punk"));
  assert.ok(queries[0].values.includes("Around%"));
  assert.ok(queries[0].sql.includes("GROUP BY t.album_art ORDER BY MIN(pt.xata_createdat) LIMIT 4"));
  await run(Playlists.retrieveActorPlaylists(db)({ ...params, filter: "name==Mix" }));
  assert.equal(/exists \(select/i.test(queries[1].sql), false);
  await assert.rejects(run(Playlists.retrieveActorPlaylists(db)({ ...params, filter: "password==x" })), e => e.customErrorName === "InvalidFilter");
  assert.equal(queries.length, 2);
}
console.log("Verified actor playlist correlated track filters, bound values, cover mosaic SQL and pre-query filter rejection.");
