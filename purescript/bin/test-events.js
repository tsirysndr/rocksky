import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PgDialect } from "drizzle-orm/pg-core";
const source = await readFile(new URL("../api/src/Rocksky/Lib/Env.purs", import.meta.url), "utf8");
process.env.NODE_ENV = "test";
for (const [, key] of source.matchAll(/"([A-Z0-9_]+)": str required/g)) process.env[key] = "event-test";
const V = await import("../output/Rocksky.Lib.EventView/index.js");
const P = await import("../output/Rocksky.Xrpc.App.Rocksky.Event.PutRsvp/index.js");
const { fromAff } = await import("../output/Control.Promise/index.js");
const { Just, Nothing } = await import("../output/Data.Maybe/index.js");
const { pure } = await import("../output/Control.Applicative/index.js");
const { applicativeAff } = await import("../output/Effect.Aff/index.js");
const run = aff => fromAff(aff)();
const dialect = new PgDialect();
const sql = value => dialect.sqlToQuery(value);
const date = new Date("2026-10-18T11:30:00Z");
const user = { id: "u", did: "did:plc:viewer", handle: "viewer.test", displayName: "Viewer", avatar: "" };
const event = { id: "e", uri: "at://did:plc:organizer/community.lexicon.calendar.event/show", cid: "event-cid", musicUri: "at://did:plc:organizer/app.rocksky.event.music/show", name: "Show", updatedAt: date, xataCreatedAt: date };
const row = { events: event, users: user };
const media = role => ({ role, content: { ref: { $link: role }, mimeType: "image/png", size: 4 }, aspect_ratio: { width: 4, height: 0 } });
assert.equal(V.toLocationView({ $type: "unknown" }).constructor.name, "Nothing");
assert.deepEqual(V.toLocationView({ $type: "community.lexicon.location.fsq", fsq_place_id: "venue", latitude: 5, longitude: "4" }).value0, { type: "community.lexicon.location.fsq", fsqPlaceId: "venue", longitude: "4" });
assert.equal(V.toMediaView({})(user.did).constructor.name, "Nothing");
const view = V.toEventView({ ...row, events: { ...event, media: [media("poster"), media("thumbnail")], uris: [{ uri: "" }, { uri: "https://venue.test" }] } })([])(V.emptyCounts)(Nothing.value)();
assert.equal(view.imageUrl, "https://cdn.bsky.app/img/feed_fullsize/plain/" + user.did + "/thumbnail@jpeg");
assert.equal("height" in view.media[0], false);
assert.equal("organizerAvatarUrl" in view, false);
assert.equal(view.createdAt, date.toISOString());
assert.deepEqual(view.uris, [{ uri: "https://venue.test" }]);
assert.equal(V.startOfToday(date)().toISOString(), "2026-10-18T00:00:00.000Z");
const filters = { limit: 20, offset: 0 };
const upcoming = await run(V.eventConditions(filters));
assert.ok(sql(upcoming.where_).sql.includes("coalesce"));
assert.ok(sql(upcoming.order).sql.endsWith("ASC NULLS LAST"));
const history = await run(V.eventConditions({ ...filters, includePast: true }));
assert.equal(sql(history.where_).sql.includes("coalesce"), false);
assert.ok(sql(history.order).sql.endsWith("DESC NULLS LAST"));
const window = await run(V.eventConditions({ ...filters, includePast: true, from: "2026-10-01", to: "2026-10-31", artist: "a", rsvpBy: user.did, genre: "Rock" }));
assert.ok(sql(window.order).sql.endsWith("ASC NULLS LAST"));
assert.ok(sql(window.where_).sql.includes("attended.duplicate_of"));
assert.ok(sql(window.where_).params.includes(user.did));
await assert.rejects(run(V.eventConditions({ ...filters, from: "no-date" })), /not a valid datetime/);
function mockDb(results) {
  const calls = [];
  const db = {
    select(fields) {
      const q = {};
      for (const key of ["from", "innerJoin", "leftJoin", "where", "orderBy", "groupBy", "limit", "offset"]) q[key] = value => { if (key === "where") calls.push(["where", sql(value)]); return q; };
      q.execute = async () => { assert.ok(results.length, "Unexpected select"); return results.shift(); };
      return q;
    },
    async execute(statement) { calls.push(["lock", sql(statement)]); },
    insert() {
      const q = {
        values(value) { calls.push(["insert", value]); return q; },
        onConflictDoUpdate(value) { calls.push(["upsert", value]); return q; },
        async execute() { calls.push(["write"]); },
      };
      return q;
    },
    async transaction(fn) { calls.push(["begin"]); try { const out = await fn(db); calls.push(["commit"]); return out; } catch (e) { calls.push(["rollback"]); throw e; } },
  };
  return { db, calls };
}
assert.deepEqual(await run(V.hydrateEvents({})([])(Nothing.value)), []);
{
  const mock = mockDb([
    [{ entry: { eventId: "e", name: "Billed name", startsAt: date }, artist: null }],
    [{ eventId: "e", status: V.rsvpGoing, count: 3 }, { eventId: "e", status: V.rsvpInterested, count: 2 }],
    [{ eventId: "e", status: V.rsvpGoing }],
  ]);
  const [hydrated] = await run(V.hydrateEvents({ db: mock.db })([row])(new Just(user.did)));
  assert.equal(hydrated.artists[0].name, "Billed name");
  assert.deepEqual(hydrated.rsvpCounts, { going: 3, interested: 2, notGoing: 0 });
  assert.equal(hydrated.viewerRsvp, V.rsvpGoing);
}
{
  const duplicate = { events: { ...event, id: "duplicate", duplicateOf: "e" }, users: user };
  const mock = mockDb([[{ did: "did:plc:organizer" }], [duplicate], [row]]);
  assert.equal((await run(V.findEvent({ db: mock.db })("at://organizer.test/community.lexicon.calendar.event/show"))).value0.events.id, "e");
}
const input = { uri: event.uri, status: V.rsvpGoing };
await assert.rejects(run(P.putRsvp({})(input)(Nothing.value)), /Sign in to RSVP/);
await assert.rejects(run(P.putRsvp({})({ ...input, status: "bad" })(new Just(user.did))), /Invalid RSVP status/);
for (const fail of [false, true]) {
  const duplicate = { ...event, id: "duplicate", cid: null, uri: "at://did:plc:organizer/community.lexicon.calendar.event/duplicate" };
  const old = { uri: "at://" + user.did + "/community.lexicon.calendar.rsvp/old-key" };
  const mock = mockDb([[row], [user], [{ rsvp: old, event: duplicate }]]);
  const agent = { com: { atproto: { repo: {
    async getRecord(input) { mock.calls.push(["get", input]); return { data: { cid: "resolved-cid" } }; },
    async putRecord(input) {
      mock.calls.push(["pds", input]);
      if (fail) throw Object.assign(new Error("denied"), { status: 403 });
      return { data: { uri: old.uri, cid: "rsvp-cid" } };
    },
  } } } };
  const action = P.putRsvpWithAgent({ db: mock.db })(input)(new Just(user.did))(() => () => pure(applicativeAff)(new Just(agent)));
  if (fail) {
    await assert.rejects(run(action), /grant RSVP access/);
    assert.equal(mock.calls.some(([key]) => key === "insert"), false);
    assert.equal(mock.calls.at(-1)[0], "rollback");
  } else {
    assert.deepEqual(await run(action), { uri: old.uri, status: V.rsvpGoing });
    const pds = mock.calls.find(([key]) => key === "pds")[1];
    assert.equal(pds.rkey, "old-key");
    assert.equal(pds.record.subject.uri, duplicate.uri);
    assert.equal(pds.record.subject.cid, "resolved-cid");
    assert.equal(pds.validate, false);
    assert.equal("swapRecord" in pds, false);
    assert.equal(mock.calls.find(([key]) => key === "insert")[1][0].eventId, "duplicate");
    assert.ok(mock.calls.findIndex(([key]) => key === "lock") < mock.calls.findIndex(([key]) => key === "pds"));
    assert.ok(mock.calls.findIndex(([key]) => key === "pds") < mock.calls.findIndex(([key]) => key === "insert"));
    assert.equal(mock.calls.at(-1)[0], "commit");
  }
}
console.log("Verified event views, date/artist/RSVP filters, hydration, duplicate resolution, advisory lock ordering, existing subject identity and PDS failure rollback.");
