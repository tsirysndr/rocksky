import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = await readFile(new URL("../api/src/Rocksky/Lib/Env.purs", import.meta.url), "utf8");
process.env.NODE_ENV = "test";
for (const [, key] of source.matchAll(/"([A-Z0-9_]+)": str required/g)) process.env[key] = "submission-test";
process.env.SUBMISSIONS_SECRET = "s".repeat(48);
const { fromAff } = await import("../output/Control.Promise/index.js");
const { app } = await import("../output/Rocksky.Submissions.App/index.js");
const { loadLexicons } = await import("../output/Rocksky.Lexicon/index.js");
const { Lexicons } = await import("@atproto/lexicon");
const run = value => fromAff(value)();
const lexicons = new Lexicons(await run(loadLexicons));
let dbCalls = 0;
const ctx = new Proxy({ lexicons, db: {
  select() {
    dbCalls++;
    const b = { from: () => b, innerJoin: () => b, where: () => b, limit: () => b, execute: async () => [{ pushEnabled: false }] };
    return b;
  },
} }, { get(o, k) { assert.ok(k in o, "Unexpected service " + String(k)); return o[k]; } });
const routes = app(ctx)();
async function request(route, body, secret = process.env.SUBMISSIONS_SECRET) {
  const response = await routes.request("http://localhost" + route, {
    method: "POST", headers: { "content-type": "application/json", "x-rocksky-submissions-secret": secret }, body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
const base = { did: "did:plc:listener", submissionId: "a".repeat(64), recordKey: "3mv234567abcd" };
for (const route of ["/process", "/tealfm/process"]) {
  assert.deepEqual(await request(route, {}, "wrong"), { status: 401, body: { error: "Unauthorized" } });
  assert.equal((await request(route, {})).status, 400);
  assert.equal((await request(route, { ...base, did: "not-a-did" })).status, 400);
  assert.equal((await request(route, { ...base, submissionId: "ABC" })).status, 400);
}
for (const track of [undefined, {}, { title: "Song", artist: "Artist", album: "Album", albumArtist: "Artist", duration: 1000, timestamp: 0 }]) {
  assert.deepEqual(await request("/process", { ...base, track }), { status: 400, body: { error: "Invalid stored track" } });
}
const stored = { title: "Song", artist: "Artist", album: "Album", albumArtist: "Artist", duration: 1000, timestamp: 1700000000 };
assert.deepEqual(await request("/process", { ...base, track: stored, recordKey: "bad" }), { status: 400, body: { error: "Invalid stored record key" } });
const teal = { $type: "fm.teal.feed.play", trackName: "Song", artists: [{ artistName: "Artist" }], playedTime: "2026-10-18T00:00:00Z", duration: 100 };
assert.equal((await request("/tealfm/process", { ...base, track: { ...teal, playedTime: "bad" } })).status, 400);
assert.deepEqual(await request("/tealfm/process", { ...base, track: teal, recordKey: "bad" }), { status: 400, body: { error: "Invalid stored record key" } });
assert.equal(dbCalls, 0, "Invalid callbacks must stop before database or agent access");
assert.deepEqual(await request("/tealfm/process", { ...base, track: teal }), { status: 200, body: { status: "published", submissionId: base.submissionId } });
assert.equal(dbCalls, 1, "Preferences must be checked on each Teal attempt");

const { publishWithAgent } = await import("../output/Rocksky.Subscribers.Playlist/index.js");
const writes = [];
const date = new Date("2025-01-01T00:00:00Z");
const songUri = "at://did:plc:artist/app.rocksky.song/song";
const playlistUri = "at://did:plc:listener/app.rocksky.playlist/existing";
const responses = [[{ uri: playlistUri, createdAt: date }], [{ uri: songUri }]];
const db = { select() {
  const b = {};
  for (const name of ["from", "where", "limit", "leftJoin"]) b[name] = () => b;
  b.execute = async () => { assert.ok(responses.length); return responses.shift(); };
  return b;
} };
const agent = { assertDid: base.did, com: { atproto: { repo: {
  async putRecord(input) { writes.push(input); return { data: { uri: playlistUri, cid: "cid" } }; },
  async createRecord() { assert.fail("Already-indexed song must not be published again"); },
} } } };
await run(publishWithAgent({ db, lexicons })(agent)({ did: base.did, name: "Imported", spotifyLink: "https://open.spotify.com/playlist/list", songs: [{ uri: songUri }], description: "" }));
assert.equal(responses.length, 0);
assert.equal(writes.length, 1);
assert.equal(writes[0].rkey, "existing");
assert.equal(writes[0].record.createdAt, date.toISOString());
assert.equal("description" in writes[0].record, false);
assert.equal("swapRecord" in writes[0], false);
console.log("Verified submission authentication/validation, Teal opt-out and playlist re-import identity/dedup.");

const { parseTrack } = await import("../output/Rocksky.Types.Track/index.js");
const missing = parseTrack(stored);
const explicit = parseTrack({ ...stored, mbId: null, lyrics: null });
assert.equal(missing.constructor.name, "Right");
assert.equal(missing.value0.mbId, undefined);
assert.equal(explicit.value0.mbId, null);
assert.equal(explicit.value0.lyrics, null);
console.log("Verified missing versus explicit-null track metadata survives submission decoding.");
const { fromError, toError, ScrobbleBlocked } = await import("../output/Rocksky.Lib.ScrobbleGuard/index.js");
const blocked = fromError(toError(new ScrobbleBlocked({ did: base.did, retryAfter: 127 })));
assert.equal(blocked.value0.value0.retryAfter, 127, "Numeric retryAfter must survive error conversion");
const { Kysely, DummyDriver, SqliteQueryCompiler, SqliteAdapter, SqliteIntrospector } = await import("kysely");
const sqliteDb = new Kysely({ dialect: {
  createDriver: () => new DummyDriver(), createQueryCompiler: () => new SqliteQueryCompiler(),
  createAdapter: () => new SqliteAdapter(), createIntrospector: db => new SqliteIntrospector(db),
} });
async function processWith({ isBot = false, ttl = -1, pds = "missing", revoked = false }) {
  const route = app({
    sqliteDb, lexicons,
    oauthClient: { async restore() {
      if (revoked) throw Object.assign(new Error("revoked"), { name: "AuthMethodUnsatisfiableError" });
      return { did: base.did, async fetchHandler() {
        if (pds === "failure") throw new Error("offline");
        if (pds === "exists") return Response.json({ uri: "at://" + base.did + "/app.rocksky.scrobble/" + base.recordKey, cid: "bafyreie5n7e4zv3re7yjy6ol7wrtgz5v67z3gn5pe5osrjgggpjjb47vgq", value: {} });
        return Response.json({ error: "RecordNotFound", message: "missing" }, { status: 400 });
      } };
    } },
    db: { select() { const b = { from: () => b, where: () => b, limit: () => b, execute: async () => [{ isBot }] }; return b; } },
    redis: { async ttl() { return ttl; } },
  })();
  return route.request("http://localhost/process", { method: "POST", headers: { "content-type": "application/json", "x-rocksky-submissions-secret": process.env.SUBMISSIONS_SECRET }, body: JSON.stringify({ ...base, track: stored }) });
}
const bot = await processWith({ isBot: true });
assert.equal(bot.status, 403);
assert.deepEqual(await bot.json(), { error: "Account flagged as bot" });
const temporary = await processWith({ ttl: 127 });
assert.equal(temporary.status, 429);
assert.equal(temporary.headers.get("Retry-After"), "127");
assert.deepEqual(await temporary.json(), { error: "Scrobble temporarily blocked" });
assert.equal((await processWith({ pds: "failure" })).status, 503);
assert.equal((await processWith({ revoked: true })).status, 401);
assert.equal((await processWith({ pds: "exists" })).status, 200);
await sqliteDb.destroy();
console.log("Verified real callback routing for bot blocks, Retry-After, PDS failures, expired sessions and durable recovery.");
