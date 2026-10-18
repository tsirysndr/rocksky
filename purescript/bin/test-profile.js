import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = await readFile(new URL("../api/src/Rocksky/Lib/Env.purs", import.meta.url), "utf8");
process.env.NODE_ENV = "test";
for (const [, key] of source.matchAll(/"([A-Z0-9_]+)": str required/g)) process.env[key] = "profile-test";
const P = await import("../output/Rocksky.Xrpc.App.Rocksky.Actor.GetProfile/index.js");
const { fromAff } = await import("../output/Control.Promise/index.js");
const { Just, Nothing } = await import("../output/Data.Maybe/index.js");
const { pure } = await import("../output/Control.Applicative/index.js");
const { applicativeAff } = await import("../output/Effect.Aff/index.js");
const aff = value => pure(applicativeAff)(value);
const run = action => fromAff(action)();
const date = new Date("2026-10-18T00:00:00Z");
const user = { id: "u", did: "did:plc:actor", handle: "old.test", avatar: "saved-avatar", displayName: "Saved Name", createdAt: date, updatedAt: date, xataVersion: 0, isBot: false, botFlaggedAt: null, botReason: null };
function mock(responses) {
  const writes = [], events = [];
  const db = {
    select() {
      const q = {};
      for (const name of ["from", "where", "leftJoin", "innerJoin", "groupBy", "orderBy"]) q[name] = () => q;
      q.execute = async () => { assert.ok(responses.length, "Unexpected query"); return responses.shift(); };
      return q;
    },
    insert() {
      const q = { values(value) { writes.push(["insert", value]); return q; }, async execute() {} };
      return q;
    },
    update() {
      const q = { set(value) { writes.push(["update", value]); return q; }, where() { return q; }, async execute() {} };
      return q;
    },
  };
  const ctx = { db, nc: { publish(subject, bytes) { events.push([subject, JSON.parse(Buffer.from(bytes).toString())]); } } };
  return { ctx, writes, events, done() { assert.equal(responses.length, 0); } };
}
await assert.rejects(run(P.resolveActor({})(Nothing.value)(Nothing.value)), /neither an actor/);
{
  let calls = 0;
  const ctx = { baseIdResolver: { handle: { async resolve(name) { calls++; assert.equal(name, "actor.test"); return user.did; } } } };
  assert.deepEqual(await run(P.resolveActor(ctx)(new Just("actor.test"))(new Just("did:plc:viewer"))), { did: user.did, explicit: new Just(user.did) });
  assert.equal(calls, 1);
  assert.equal((await run(P.resolveActor({})(Nothing.value)(new Just(user.did)))).did, user.did);
}
{
  const m = mock([]);
  const refreshed = await run(P.refreshProfile(m.ctx)(user.did)(user.handle)({ avatar: Nothing.value, displayName: Nothing.value })(new Just(user)));
  assert.deepEqual(refreshed, user);
  assert.equal(m.writes.length, 0);
  assert.equal(m.events.length, 0);
}
{
  const m = mock([]);
  const refreshed = await run(P.refreshProfile(m.ctx)(user.did)("new.test")({ avatar: Nothing.value, displayName: new Just("New Name") })(new Just(user)));
  await new Promise(setImmediate);
  assert.equal(refreshed.avatar, "saved-avatar");
  assert.equal(refreshed.displayName, "New Name");
  assert.equal(refreshed.updatedAt, date, "Source keeps original in-memory timestamp");
  assert.equal(m.writes[0][1].avatar, "saved-avatar");
  assert.equal(m.events[0][1].xata_version, 2);
  assert.equal(m.events[0][1].handle, "new.test");
}
{
  const inserted = { ...user, handle: "new.test", avatar: "", displayName: "" };
  const m = mock([[inserted]]);
  await run(P.refreshProfile(m.ctx)(user.did)("new.test")({ avatar: Nothing.value, displayName: Nothing.value })(Nothing.value));
  assert.deepEqual(m.writes[0], ["insert", [{ did: user.did, handle: "new.test", avatar: "", displayName: "" }]]);
  assert.equal(m.events[0][1].xata_version, 1);
  assert.equal(m.events[0][1].xata_createdat, date.toISOString());
  m.done();
}
const originalFetch = globalThis.fetch;
try {
  const requested = [];
  globalThis.fetch = async url => { requested.push(String(url)); return Response.json({ service: [{ serviceEndpoint: "https://pds.example.test" }] }); };
  const m = mock([[user], [{ account: { email: "private@example.test", id: "spotify", createdAt: date, updatedAt: date } }], [{ account: { id: "token" } }], [], []]);
  let resolvedCount = 0;
  const ctx = {
    ...m.ctx,
    baseIdResolver: { handle: { async resolve() { resolvedCount++; return user.did; } } },
    resolver: { resolveDidToHandle: () => aff(user.handle) },
  };
  const result = await run(P.getProfileWith(ctx)(new Just("actor.test"))(Nothing.value)(did => agent => {
    assert.equal(did.value0, user.did);
    assert.equal(agent.constructor.name, "Just");
    return aff({ avatar: Nothing.value, displayName: Nothing.value });
  }));
  assert.equal(resolvedCount, 1);
  assert.ok(requested[0].endsWith("/" + user.did));
  assert.equal(result.displayName, "Saved Name");
  assert.equal(result.avatar, "saved-avatar");
  assert.equal(result.spotifyConnected, true);
  assert.equal("email" in result.spotifyUser, false);
  assert.equal(result.spotifyUser.createdAt, date.toISOString());
  assert.deepEqual(result.googledrive, {});
  assert.deepEqual(result.dropbox, {});
  assert.equal(m.writes.length, 0);
  m.done();
} finally { globalThis.fetch = originalFetch; }
console.log("Verified profile actor precedence/single handle resolution, missing-actor errors, partial-fetch preservation, new-user defaults, refresh events and linked-account email omission.");
const Compatibility = await import("../output/Rocksky.Xrpc.App.Rocksky.Actor.GetActorCompatibility/index.js");
const Neighbours = await import("../output/Rocksky.Xrpc.App.Rocksky.Actor.GetActorNeighbours/index.js");
const Query = await import("../output/Rocksky.Xrpc.App.Rocksky.Actor.NeighboursQuery/index.js");
const { PgDialect } = await import("drizzle-orm/pg-core");
const dialect = new PgDialect();
await assert.rejects(run(Compatibility.retrieve({})("actor.test")(Nothing.value)), /not authenticated/);
{
  const ranked = ids => ids.map(artistId => ({ artistId, scrobbles: 10 }));
  const m = mock([[{ id: "one" }], [{ id: "two" }], ranked([null, "a", "b", "c"]), ranked(["b", "d", "a"]), [{ id: "a", name: "A", picture: null, uri: null }, { id: "b", name: "B", picture: null, uri: null }]]);
  const result = await run(Compatibility.retrieve({ readDb: m.ctx.db })("actor.test")(new Just(user.did)));
  assert.equal(result.compatibilityLevel, 5);
  assert.equal(result.compatibilityPercentage, 50);
  assert.equal(result.sharedArtists, 2);
  assert.equal(result.user1ArtistCount, 3);
  assert.deepEqual(result.topSharedArtistNames, ["B", "A"]);
  assert.equal(result.topSharedDetailedArtists[0].user1Rank, 2);
  assert.equal(result.topSharedDetailedArtists[0].user2Rank, 1);
  assert.equal("picture" in result.topSharedDetailedArtists[0], false);
  m.done();
}
{
  const m = mock([[{ id: "one" }], [{ id: "two" }], [], []]);
  const result = await run(Compatibility.retrieve({ readDb: m.ctx.db })("actor.test")(new Just(user.did)));
  assert.equal(result.compatibilityPercentage, 0);
  assert.deepEqual(result.topSharedArtistNames, []);
  m.done();
}
{
  const query = dialect.sqlToQuery(Query.neighboursQuery("user'; DROP TABLE users; --"));
  assert.deepEqual(query.params, ["user'; DROP TABLE users; --", "user'; DROP TABLE users; --"]);
  assert.equal(query.sql.includes("DROP TABLE"), false);
  assert.ok(query.sql.includes("shared AS MATERIALIZED"));
  assert.ok(query.sql.includes("ts.rn <= 5"));
  const m = mock([[{ id: "target" }]]);
  m.ctx.db.execute = async () => ({ rows: [{ user_id: "neighbour", did: "did:plc:n", handle: "n.test", display_name: null, avatar: null, shared_count: 3, target_artist_count: 4, top_artists: [{ id: "a", name: "A", uri: null, picture: null }] }] });
  const result = await run(Neighbours.retrieve(m.ctx.db)("actor.test"));
  assert.equal(result[0].similarityScore, 0.75);
  assert.equal(result[0].displayName, "");
  assert.deepEqual(result[0].topSharedArtistNames, ["A"]);
  assert.equal(result[0].topSharedArtistsDetails[0].picture, null);
  m.done();
}
console.log("Verified compatibility union scoring/rank weighting/empty libraries and neighbour SQL binding/card hydration.");
