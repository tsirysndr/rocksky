import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import jwt from "jsonwebtoken";
import { createHash } from "node:crypto";
const source = await readFile(new URL("../api/src/Rocksky/Lib/Env.purs", import.meta.url), "utf8");
process.env.NODE_ENV = "test";
for (const [, key] of source.matchAll(/"([A-Z0-9_]+)": str required/g)) process.env[key] = "spotify-test";
Object.assign(process.env, { JWT_SECRET: "test-jwt", SPOTIFY_ENCRYPTION_KEY: "ab".repeat(32), SPOTIFY_ENCRYPTION_IV: "cd".repeat(16), FRONTEND_URL: "https://front.example.test", SPOTIFY_API_URL: "https://spotify.example.test/v1" });
const { app } = await import("../output/Rocksky.Spotify.App/index.js");
const Crypto = await import("../output/Rocksky.Lib.Crypto/index.js");
const Ref = await import("../output/Effect.Ref/index.js");
const Map = await import("../output/Data.Map/index.js");
const encrypt = s => Crypto.encrypt(s)(process.env.SPOTIFY_ENCRYPTION_KEY)();
const decrypt = s => Crypto.decrypt(s)(process.env.SPOTIFY_ENCRYPTION_KEY)();
const user = { id: "u", did: "did:plc:listener" };
const config = { spotifyAppId: "client", spotifySecret: encrypt("secret") };
const token = { refreshToken: encrypt("refresh") };
const authorization = "Bearer " + jwt.sign({ did: user.did }, process.env.JWT_SECRET);
function context(responses) {
  const writes = [], publications = [];
  const ctx = {
    kv: Ref["new"](Map.empty)(), metrics: { requestCounter: { add() {} } },
    redis: { async eval() { return 1; }, async get() { return null; } },
    nc: { publish(subject, bytes) { publications.push([subject, Buffer.from(bytes).toString()]); } },
    db: {
      select() {
        const q = {};
        for (const key of ["from", "where", "innerJoin", "leftJoin", "limit", "groupBy", "having"]) q[key] = () => q;
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
    },
  };
  return { ctx, writes, publications, done() { assert.equal(responses.length, 0); } };
}
const originalFetch = globalThis.fetch;
const requests = [], responses = [];
globalThis.fetch = async (url, options) => { requests.push([String(url), options]); assert.ok(responses.length, "Unexpected HTTP request"); return responses.shift(); };
try {
  const anonymous = app(context([]).ctx)();
  for (const [path, method] of [["/login", "GET"], ["/join", "POST"], ["/currently-playing", "GET"], ["/play", "PUT"], ["/pause", "PUT"], ["/next", "POST"], ["/previous", "POST"], ["/seek", "PUT"], ["/volume", "GET"]]) {
    assert.equal((await anonymous.request("http://localhost" + path, { method })).status, 401);
  }
  assert.equal((await anonymous.request("http://localhost/volume?volume_percent=101", { method: "PUT" })).status, 400);
  for (const existing of [false, true]) {
    const m = context([[user], [{ account: { spotifyAppId: "client" }, app: config }], [user], [{ account: { spotifyAppId: "client" }, app: config }], existing ? [{ id: "t" }] : [], [{ email: "listener@example.test" }]]);
    const routes = app(m.ctx)();
    const login = await routes.request("http://localhost/login", { headers: { authorization } });
    const { redirectUrl } = await login.json();
    const state = new URL(redirectUrl).searchParams.get("state");
    assert.match(state, /^[a-f0-9]{32}$/);
    assert.ok(login.headers.get("set-cookie").includes("HttpOnly; SameSite=Strict; Secure"));
    responses.push(Response.json({ access_token: "access", refresh_token: "new-refresh" }));
    const callback = await routes.request("http://localhost/callback?state=" + state + "&code=code");
    assert.equal(callback.status, 302);
    const form = new URLSearchParams(requests.at(-1)[1].body);
    assert.equal(form.get("client_secret"), "secret");
    assert.equal(form.get("code"), "code");
    const [operation, values] = m.writes[0];
    assert.equal(operation, existing ? "update" : "insert");
    const stored = Array.isArray(values) ? values[0] : values;
    assert.equal(decrypt(stored.accessToken), "access");
    assert.equal(decrypt(stored.refreshToken), "new-refresh");
    assert.deepEqual(m.publications, [["rocksky.spotify.user", "listener@example.test"]]);
    assert.equal((await routes.request("http://localhost/callback?state=" + state)).status, 302);
    m.done();
  }
  for (const [path, method] of [["/play", "PUT"], ["/pause", "PUT"], ["/next", "POST"], ["/previous", "POST"], ["/seek?position_ms=123", "PUT"]]) {
    const m = context([[user], [{ token, app: config }]]);
    responses.push(Response.json({ access_token: "fresh" }), new Response("Premium needed", { status: 403 }));
    const response = await app(m.ctx)().request("http://localhost" + path, { method, headers: { authorization } });
    assert.equal(response.status, 403);
    assert.equal(await response.text(), "Premium needed");
    assert.equal(requests.at(-1)[1].headers.Authorization, "Bearer fresh");
    const form = new URLSearchParams(requests.at(-2)[1].body);
    assert.equal(form.get("refresh_token"), "refresh");
    m.done();
  }
  for (const [method, downstream, expected] of [
    ["PUT", new Response(null, { status: 204 }), null],
    ["GET", new Response(null, { status: 204 }), { volume: null, supported: false }],
    ["GET", Response.json({ device: { volume_percent: 50, supports_volume: true, is_restricted: true } }), { volume: 50, supported: false }],
  ]) {
    const m = context([[user], [{ token, app: config }]]);
    responses.push(Response.json({ access_token: "fresh" }), downstream);
    const response = await app(m.ctx)().request("http://localhost/volume?volume_percent=50", { method, headers: { authorization } });
    if (method === "PUT") assert.equal(response.status, 204);
    else assert.deepEqual(await response.json(), expected);
    m.done();
  }
  {
    const m = context([[user], [{ token, app: config }]]);
    responses.push(new Response("", { status: 401 }));
    assert.equal((await app(m.ctx)().request("http://localhost/volume", { headers: { authorization } })).status, 401);
    m.done();
  }
  {
    const cached = { item: { name: "Song", artists: [{ name: "Artist" }], album: { name: "Album" } }, is_playing: true };
    const m = context([[user], [{ spotifyAccount: { email: "listener@example.test" } }], [{ uri: "song", artistUri: null, albumUri: "album" }], [{}]]);
    m.ctx.redis.get = async key => { assert.equal(key, "listener@example.test:current"); return JSON.stringify(cached); };
    const response = await app(m.ctx)().request("http://localhost/currently-playing?did=listener.test");
    const result = await response.json();
    assert.equal(result.songUri, "song");
    assert.equal(result.artistUri, null);
    assert.equal(result.liked, true);
    assert.equal(result.sha256, createHash("sha256").update("song - artist - album").digest("hex"));
    m.done();
  }
  {
    const m = context([[user], [{ spotifyAppId: "available-client" }]]);
    responses.push(Response.json({}));
    const response = await app(m.ctx)().request("http://localhost/join", {
      method: "POST", headers: { authorization, "content-type": "application/json" },
      body: JSON.stringify({ email: "listener@example.test" }),
    });
    assert.equal(response.status, 200);
    assert.equal(m.writes[0][1][0].spotifyAppId, "available-client");
    assert.equal(m.writes[0][1][0].isBetaUser, false);
    assert.equal(requests.at(-1)[0], "https://beta.rocksky.app");
    assert.deepEqual(JSON.parse(requests.at(-1)[1].body), { email: "listener@example.test" });
    m.done();
  }
  {
    const m = context([[user], [{ token, app: config }]]);
    responses.push(Response.json({ access_token: "fresh" }), new Response("rate limited", { status: 429, headers: { "Content-Type": "application/problem+json" } }));
    const response = await app(m.ctx)().request("http://localhost/volume", { headers: { authorization } });
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Content-Type"), "application/problem+json");
    assert.equal(await response.text(), "rate limited");
    m.done();
  }
  assert.equal(responses.length, 0);
} finally { globalThis.fetch = originalFetch; }
console.log("Verified Spotify auth guards, one-use OAuth state, encrypted token insert/update, refresh flows, 403/volume responses and public cached playback.");
