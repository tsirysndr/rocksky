import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import jwt from "jsonwebtoken";
const source = await readFile(new URL("../api/src/Rocksky/Lib/Env.purs", import.meta.url), "utf8");
process.env.NODE_ENV = "test";
for (const [, key] of source.matchAll(/"([A-Z0-9_]+)": str required/g)) process.env[key] = "rest-test";
process.env.JWT_SECRET = "test-secret";
process.env.SPOTIFY_ENCRYPTION_KEY = "ab".repeat(32);
process.env.SPOTIFY_ENCRYPTION_IV = "cd".repeat(16);
const { fromAff } = await import("../output/Control.Promise/index.js");
const Web = await import("../output/Rocksky.Webscrobbler.App/index.js");
const OG = await import("../output/Rocksky.Opengraph.App/index.js");
const run = aff => fromAff(aff)();
const metrics = { requestCounter: { add() {} } };
const user = { id: "user-1", did: "did:plc:listener", handle: "listener.test", avatar: "https://cdn/avatar/@jpeg" };
const authorization = "Bearer " + jwt.sign({ did: user.did }, process.env.JWT_SECRET);
function database(responses) {
  const writes = [];
  const db = {};
  for (const operation of ["select", "insert", "update"]) db[operation] = () => {
    const b = {};
    for (const method of ["from", "where", "limit", "innerJoin", "leftJoin", "returning"]) b[method] = () => b;
    for (const method of ["values", "set"]) b[method] = value => { writes.push({ operation, value }); return b; };
    b.execute = async () => { assert.ok(responses.length, "Unexpected database operation"); return responses.shift(); };
    return b;
  };
  return { db, writes, done() { assert.equal(responses.length, 0); } };
}
for (const module of [Web]) {
  const routes = module.app({ metrics })();
  for (const [path, method] of [["/", "GET"], ["/bad", "PUT"]]) {
    assert.equal((await routes.request("http://localhost" + path, { method })).status, 401);
  }
}
const uuid = "01234567-89ab-cdef-0123-456789abcdef";
for (const existing of [[], [{ id: "existing" }]]) {
  const saved = { id: "saved", uuid, name: "webscrobbler", userId: user.id };
  const mock = database([[user], existing, [saved]]);
  const routes = Web.app({ db: mock.db })();
  const response = await routes.request("http://localhost/" + uuid, { method: "PUT", headers: { authorization } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), saved);
  assert.equal(mock.writes[0].operation, existing.length ? "update" : "insert");
  mock.done();
}
{
  const mock = database([[user]]);
  assert.equal((await Web.app({ db: mock.db })().request("http://localhost/INVALID", { method: "PUT", headers: { authorization } })).status, 400);
  mock.done();
}
async function og(path, rows = []) {
  const mock = database([rows]);
  const routes = OG.app({ readDb: mock.db })();
  const url = new URL("http://localhost/");
  if (path !== undefined) url.searchParams.set("path", path);
  return routes.request(url);
}
assert.equal((await og()).status, 400);
assert.equal((await og("/unsupported")).status, 400);
assert.equal((await og("/profile/missing")).status, 404);
const profile = await (await og("/profile/listener.test", [user])).json();
assert.equal(profile.title, "@listener.test on Rocksky");
assert.equal("image" in profile, false);
for (const kind of ["album", "artist", "song"]) {
  assert.equal((await og("/did:plc:listener/" + kind + "/missing")).status, 404);
  const view = await (await og("/did:plc:listener/" + kind + "/record", [{ title: "Song", artist: "Artist", name: "Artist", albumArt: null, picture: "picture" }])).json();
  assert.equal(view.image, kind === "artist" ? "picture" : null);
  assert.equal(view.url, "https://rocksky.app/did:plc:listener/" + kind + "/record");
  assert.equal(view.twitterCard, "summary_large_image");
}
const activity = await (await og("/did:plc:listener/scrobble/record", [{ users: user, tracks: { title: "Song" }, artists: { name: "Artist" }, albums: { albumArt: "cover" } }])).json();
assert.equal(activity.title, "Scrobble: Song by Artist");
assert.equal(activity.image, "cover");
console.log("Verified REST auth guards, Webscrobbler updates, Open Graph response shapes.");

const Bsky = await import("../output/Rocksky.Bsky.App/index.js");
const Ref = await import("../output/Effect.Ref/index.js");
const Map = await import("../output/Data.Map/index.js");
const Aff = await import("../output/Effect.Aff/index.js");
const { pure } = await import("../output/Control.Applicative/index.js");
const kv = Ref["new"](Map.empty)();
const authCalls = [];
const publications = [];
const mock = database([[{ email: "listener@example.test" }]]);
const bsky = Bsky.app({
  metrics, kv, db: mock.db,
  resolver: { resolveDidToHandle: () => pure(Aff.applicativeAff)(user.handle) },
  nc: { publish(subject, bytes) { publications.push([subject, Buffer.from(bytes).toString()]); } },
  oauthClient: {
    clientMetadata: { client_name: "Rocksky" },
    async authorize(handle, options) { authCalls.push({ handle, options }); return new URL("https://pds.example.test/authorize"); },
    async callback(params) { assert.equal(params.get("code"), "code"); return { session: { did: user.did } }; },
  },
})();
assert.equal((await bsky.request("http://localhost/login?handle=bad")).status, 400);
assert.equal((await bsky.request("http://localhost/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle: "bad" }) })).status, 400);
assert.equal((await bsky.request("http://localhost/profile")).status, 401);
const login = await bsky.request("http://localhost/login?handle=" + user.handle + "&cli=1");
assert.equal(login.status, 302);
assert.equal(login.headers.get("location"), "https://pds.example.test/authorize");
assert.equal(authCalls[0].handle, user.handle);
assert.ok(authCalls[0].options.scope.includes("atproto"));
const callback = await bsky.request("http://localhost/oauth/callback?code=code");
assert.equal(callback.status, 302);
assert.ok(callback.headers.get("location").endsWith("?did=" + user.did + "&cli=1"));
assert.deepEqual(publications, [["rocksky.spotify.user", "listener@example.test"]]);
mock.done();
const tokenResponse = await bsky.request("http://localhost/token", { headers: { "session-did": user.did } });
const { token } = await tokenResponse.json();
const claims = jwt.verify(token, process.env.JWT_SECRET);
assert.equal(claims.did, user.did);
assert.ok(claims.exp - claims.iat > 60 * 60 * 24 * 365 * 999);
assert.equal((await bsky.request("http://localhost/token", { headers: { "session-did": user.did } })).status, 401);
assert.deepEqual(await (await bsky.request("http://localhost/client-metadata.json")).json(), { client_name: "Rocksky" });
const keys = await (await bsky.request("http://localhost/jwks.json")).json();
assert.equal(keys.keys.length, 3);
assert.equal("alg" in keys.keys[2], false);
const postLogin = await bsky.request("http://localhost/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle: user.handle }) });
assert.equal(await postLogin.text(), "https://pds.example.test/authorize");
const promptLogin = await bsky.request("http://localhost/login?prompt=create");
assert.equal(promptLogin.status, 302);
assert.equal(authCalls.at(-1).handle, process.env.ROCKSKY_SIGNUP_PDS || "https://rocksky.social");
assert.equal(authCalls.at(-1).options.prompt, "create");

const View = await import("../output/Rocksky.Lib.DiscogsView/index.js");
const emptyRelations = { credits: [], tracklist: [], labels: [], identifiers: [], artists: [], master: null };
assert.equal(View.toDiscogsView(null)(emptyRelations), undefined);
const release = { discogsId: 123, title: "Record", artist: "Artist", score: 0.945, masterId: null, genres: [], year: 0 };
const view = View.toDiscogsView(release)(emptyRelations);
assert.deepEqual(JSON.parse(JSON.stringify(view)), { releaseId: 123, title: "Record", artist: "Artist", genres: [], year: 0, score: 95 });
assert.deepEqual(View.toDiscogsCreditViews([{ artistId: null, name: "Name", role: "", tracks: null }]), [{ name: "Name", role: "" }]);
const fullView = View.toDiscogsView(release)({ ...emptyRelations, master: { discogsId: 9, title: "Original", artist: null }, tracklist: [{ title: "Song", position: "A1", durationMs: 0 }] });
assert.equal(fullView.master.masterId, 9);
assert.equal(fullView.tracklist[0].durationMs, 0);
console.log("Verified Bluesky OAuth CLI flow, one-time JWT retrieval, metadata and Discogs view omission/rounding.");

const Analysis = await import("../output/Rocksky.Uploads.Analysis/index.js");
const { PgDialect } = await import("drizzle-orm/pg-core");
const analysisWrites = [];
const analysisCtx = { db: { update() {
  const q = {
    set(fields) { analysisWrites.push(fields); return q; },
    where() { return q; },
    async execute() {},
  };
  return q;
} } };
await run(Analysis.storeTrackAnalysis(analysisCtx)("track")(null)(null)(null));
assert.equal(analysisWrites.length, 0);
await run(Analysis.storeTrackAnalysis(analysisCtx)("track")("C major")(120.5)("fingerprint"));
const dialect = new PgDialect();
for (const [key, expected] of Object.entries({ key: "C major", bpm: 120.5, acoustidFingerprint: "fingerprint" })) {
  const query = dialect.sqlToQuery(analysisWrites[0][key]);
  assert.ok(query.sql.startsWith("coalesce("));
  assert.deepEqual(query.params, [expected]);
}
console.log("Verified upload analysis skips empty results and only fills missing track metadata.");

const Common = await import("../output/Rocksky.Lib.Common/index.js");
const UserUtils = await import("../output/Rocksky.Users.Utils/index.js");
const positions = [
  { id: "ten", discNumber: 1, trackNumber: 10, lyrics: "" },
  { id: "two", discNumber: 1, trackNumber: 2, lyrics: null },
  { id: "ten-lyrics", discNumber: 1, trackNumber: 10, lyrics: "words" },
  { id: "missing", lyrics: null },
  { id: "null", discNumber: null, trackNumber: null, lyrics: null },
];
assert.deepEqual(Common.dedupeTracksKeepLyrics(positions).map(t => t.id), ["ten-lyrics", "two", "missing", "null"]);
assert.deepEqual(UserUtils.dedupeTracksKeepLyrics(positions.map(t => ({ id: t.id, disc_number: t.discNumber, track_number: t.trackNumber, lyrics: t.lyrics }))).map(t => t.id), ["ten-lyrics", "two", "missing", "null"]);
console.log("Verified track deduplication preserves insertion order, prefers nonempty lyrics, and distinguishes missing/null positions.");
