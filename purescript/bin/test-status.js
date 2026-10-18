import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const envSource = await readFile(new URL("../api/src/Rocksky/Lib/Env.purs", import.meta.url), "utf8");
process.env.NODE_ENV = "test";
for (const [, name] of envSource.matchAll(/"([A-Z0-9_]+)": str required/g)) process.env[name] = "status-test";
const { fromAff } = await import("../output/Control.Promise/index.js");
const S = await import("../output/Rocksky.Subscribers.Status/index.js");
const Info = await import("../output/Rocksky.Subscribers.Status.Info/index.js");
const { Nothing, Just } = await import("../output/Data.Maybe/index.js");
const { Kysely, DummyDriver, SqliteAdapter, SqliteQueryCompiler, SqliteIntrospector } = await import("kysely");
const run = aff => fromAff(aff)();
const sqliteDb = new Kysely({ dialect: { createDriver: () => new DummyDriver(), createAdapter: () => new SqliteAdapter(), createQueryCompiler: () => new SqliteQueryCompiler(), createIntrospector: db => new SqliteIntrospector(db) } });
const NativeDate = Date;
let clock = 1700000000000;
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
};
const realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout;
const timers = new Map();
let timerId = 0;
globalThis.setTimeout = (fn, delay, ...args) => {
  if (delay >= 5000) { const id = { testTimer: ++timerId }; timers.set(id, { fn, delay }); return id; }
  return realSet(fn, delay, ...args);
};
globalThis.clearTimeout = id => { if (!timers.delete(id)) realClear(id); };
const did = "did:plc:listener";
const cid = "bafyreie5n7e4zv3re7yjy6ol7wrtgz5v67z3gn5pe5osrjgggpjjb47vgq";
function harness() {
  const events = [], writes = [], deletedKeys = [];
  const control = { rateLimit: false, readFailure: false, restore: 0, existingCid: false };
  const ctx = { sqliteDb,
    matching: { async post() { events.push("match"); return { data: { policyVersion: "1", status: "unmatched", track: null } }; } },
    redis: { async del(keys) { deletedKeys.push(...keys); return 1; } },
    oauthClient: { async restore() {
      control.restore++;
      return { did, async fetchHandler(url, init) {
        if (String(url).includes("getRecord")) {
          events.push("get");
          if (control.existingCid) return Response.json({ uri: "at://" + did + "/app.rocksky.actor.status/self", cid, value: {} });
          return Response.json({ error: control.readFailure ? "InternalServerError" : "RecordNotFound" }, { status: control.readFailure ? 503 : 400 });
        }
        if (String(url).includes("putRecord")) {
          events.push("put");
          if (control.rateLimit) return Response.json({ error: "RateLimitExceeded" }, { status: 429, headers: { "retry-after": "60" } });
          writes.push(JSON.parse(typeof init.body === "string" ? init.body : Buffer.from(init.body).toString()));
          return Response.json({ uri: "at://" + did + "/app.rocksky.actor.status/self", cid });
        }
        if (String(url).includes("deleteRecord")) { events.push("delete"); return Response.json({}); }
        throw new Error("Unexpected URL " + url);
      } };
    } },
  };
  return { ctx, events, writes, deletedKeys, control, state: S.newState() };
}
const raw = { name: "Song", artist: "Artist", album: "Album", duration_ms: 180000, source: "rockbox" };
const payload = track => ({ did, track });
try {
  const h = harness();
  await run(S.changed(h.state)(h.ctx)(payload(raw)));
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].record.track.source, "rockbox");
  assert.equal("swapRecord" in h.writes[0], false);
  assert.equal(h.writes[0].record.expiresAt, new Date(clock + 180000).toISOString());
  await run(S.changed(h.state)(h.ctx)(payload(raw)));
  assert.equal(h.writes.length, 1);
  assert.equal(h.control.restore, 1);
  await run(S.stopped(h.state)(h.ctx)({ did }));
  const oldStop = [...timers.values()].find(t => t.delay === 185000);
  assert.ok(oldStop);
  assert.equal(h.events.includes("delete"), false);
  await run(S.changed(h.state)(h.ctx)(payload({ ...raw, source: "navidrome" })));
  assert.equal(h.writes.length, 2, "Different source must take ownership");
  assert.deepEqual(h.deletedKeys, ["ws_lastsong:" + did]);
  oldStop.fn();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.events.includes("delete"), false, "Stale deferred stop must not delete newer status");
  await run(S.stopped(h.state)(h.ctx)({ did }));
  const activeStop = [...timers.values()].filter(t => t.delay === 185000).at(-1);
  clock += 185000;
  activeStop.fn();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.events.filter(e => e === "delete").length, 1);
  const restoreCount = h.control.restore;
  await run(S.stopped(h.state)(h.ctx)({ did }));
  assert.equal(h.control.restore, restoreCount, "Explicit stopped state suppresses repeat deletes");
  const limited = harness();
  limited.control.rateLimit = true;
  await run(S.changed(limited.state)(limited.ctx)(payload(raw)));
  const count = limited.control.restore;
  await run(S.changed(limited.state)(limited.ctx)(payload(raw)));
  await run(S.stopped(limited.state)(limited.ctx)({ did }));
  assert.equal(limited.control.restore, count);
  clock += 61000;
  limited.control.rateLimit = false;
  await run(S.changed(limited.state)(limited.ctx)(payload(raw)));
  assert.equal(limited.writes.length, 1);
  const failed = harness();
  failed.control.readFailure = true;
  await run(S.changed(failed.state)(failed.ctx)(payload(raw)));
  assert.equal(failed.events.includes("put"), false, "Read failure must not permit blind overwrite");
  const empty = harness();
  await run(S.changed(empty.state)(empty.ctx)(payload({ ...raw, duration_ms: 0 })));
  await run(S.stopped(empty.state)(empty.ctx)({ did }));
  assert.equal(empty.events.filter(e => e === "delete").length, 1);
  assert.equal(S.backoffUntil(1000)({ response: { headers: { "ratelimit-reset": "10" } } }), 10000);
  assert.equal(S.backoffUntil(1000)({ headers: { "retry-after": "5" } }), 6000);
  assert.equal(S.backoffUntil(1000)({}), 61000);
  assert.equal(S.backoffUntil(1000)({ headers: { "ratelimit-reset": "0" } }), 0);
  const replay = harness();
  replay.control.existingCid = true;
  await run(S.changed(replay.state)(replay.ctx)(payload(raw)));
  assert.equal(replay.writes[0].swapRecord, cid);
  const expiry = [...timers.values()].filter(t => t.delay === 190000).at(-1);
  clock += 190000;
  expiry.fn();
  await run(S.changed(replay.state)(replay.ctx)(payload(raw)));
  assert.equal(replay.writes.length, 2, "Same song must publish again after in-memory expiry");
  const normal = Info.normalizeTrack({ name: "Song", artists: [{ name: "Spotify artist" }], album: { name: "Spotify album", cover: "https://art.test/a" }, duration_ms: 2000 })({ recordingMbId: new Just("mbid"), albumArt: new Just("https://fallback.test"), trackNumber: new Just(0) });
  assert.equal(normal.artist, "Spotify artist");
  assert.equal(normal.album, "Spotify album");
  assert.equal(normal.source, "spotify");
  assert.equal(normal.albumCoverUrl, "https://art.test/a");
  assert.equal("trackNumber" in normal, false);
  const info = await run(Info.resolveTrackInfo(h.ctx)({ ...raw, recording_mb_id: "provided", track_number: 0 }));
  assert.equal(info.recordingMbId.value0, "provided");
  assert.equal(info.trackNumber.constructor.name, "Nothing");
  console.log("Verified status source ownership, stop snapshots, rate-limit backoff, failed-CID read guard, metadata normalization and expiry.");
} finally {
  globalThis.Date = NativeDate;
  globalThis.setTimeout = realSet;
  globalThis.clearTimeout = realClear;
  timers.clear();
  await sqliteDb.destroy();
}
