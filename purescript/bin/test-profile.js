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
  const writes = [], events = [], conflicts = [];
  const db = {
    select() {
      const q = {};
      for (const name of ["from", "where", "leftJoin", "innerJoin", "groupBy", "orderBy"]) q[name] = () => q;
      q.execute = async () => { assert.ok(responses.length, "Unexpected query"); return responses.shift(); };
      return q;
    },
    insert() {
      const q = {
        values(value) { writes.push(["insert", value]); return q; },
        onConflictDoUpdate(config) { conflicts.push(config); return q; },
        returning() { return q; },
        async execute() { assert.ok(responses.length, "Unexpected insert"); return responses.shift(); },
      };
      return q;
    },
    update() {
      const q = { set(value) { writes.push(["update", value]); return q; }, where() { return q; }, async execute() {} };
      return q;
    },
  };
  const ctx = { db, nc: { publish(subject, bytes) { events.push([subject, JSON.parse(Buffer.from(bytes).toString())]); } } };
  return { ctx, writes, events, conflicts, done() { assert.equal(responses.length, 0); } };
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
  assert.equal(m.conflicts.length, 1);
  assert.equal(m.conflicts[0].target[0].name, "did");
  assert.equal(m.conflicts[0].set.displayName, undefined);
  assert.equal(m.conflicts[0].set.avatar, undefined);
  assert.equal(m.events[0][1].xata_version, 1);
  assert.equal(m.events[0][1].xata_createdat, date.toISOString());
  m.done();
}
const originalFetch = globalThis.fetch;
try {
  const requested = [];
  globalThis.fetch = async url => { requested.push(String(url)); return Response.json({ service: [{ serviceEndpoint: "https://pds.example.test" }] }); };
  const m = mock([[user], [{ account: { email: "private@example.test", id: "spotify", createdAt: date, updatedAt: date } }], [{ account: { id: "token" } }]]);
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
  assert.equal("googledrive" in result, false);
  assert.equal("dropbox" in result, false);
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

{
  const nullableUser = { ...user, displayName: null };
  const m = mock([]);
  const result = await run(P.refreshProfile(m.ctx)(user.did)(user.handle)({avatar: Nothing.value, displayName: Nothing.value})(new Just(nullableUser)));
  assert.equal(result.displayName, null);
  assert.equal(m.writes.length, 0);
}
console.log("Verified missing display names remain null without substituting the handle.");

// Exercise the shared REST/XRPC save path against production-like constraints.
if (process.env.PURESCRIPT_TEST_DATABASE_URL) {
  const { default: pg } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { save } = await import("../output/Rocksky.Lib.ProfileUser/index.js");
  const client = new pg.Client({ connectionString: process.env.PURESCRIPT_TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query(`CREATE TEMP TABLE users (
      xata_id text PRIMARY KEY DEFAULT md5(random()::text), did text NOT NULL,
      handle text NOT NULL, display_name text NOT NULL, avatar text NOT NULL,
      is_bot boolean NOT NULL DEFAULT false, bot_flagged_at timestamptz, bot_reason text,
      xata_createdat timestamptz NOT NULL DEFAULT now(), xata_updatedat timestamptz NOT NULL DEFAULT now(),
      xata_version integer DEFAULT 1, CONSTRAINT users__pgroll_new_did_key UNIQUE (did)
    )`);
    const db = drizzle(client);
    const missing = { avatar: Nothing.value, displayName: Nothing.value };
    const full = { avatar: new Just("saved-avatar"), displayName: new Just("Mouselett") };
    const saveUser = (did, handle, fetched) => run(save(db)(did)(handle)(fetched));
    const first = await saveUser("did:login", "mouselett.bsky.social", missing);
    assert.equal(first.displayName, "");
    assert.equal(first.avatar, "");
    const results = await Promise.all([
      saveUser("did:login", "mouselett.bsky.social", full),
      saveUser("did:login", "renamed.bsky.social", missing),
    ]);
    assert.ok(results.every(row => row.id === first.id));
    assert.equal(results[1].displayName, "Mouselett");
    assert.equal(results[1].avatar, "saved-avatar");
    assert.equal(results[1].handle, "renamed.bsky.social");
    assert.equal((await client.query("SELECT count(*)::int AS count FROM users")).rows[0].count, 1);
    console.log("Verified PostgreSQL profile defaults, duplicate-DID upserts and partial metadata preservation.");
  } finally { await client.end(); }
}
