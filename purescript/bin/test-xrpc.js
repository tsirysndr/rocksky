// Run after `spago build -p rocksky-api`. No live services or credentials needed.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createServer } from "@atproto/xrpc-server";

// Supply isolated dummy values before importing the validated application env.
const envSource = await readFile(new URL("../api/src/Rocksky/Lib/Env.purs", import.meta.url), "utf8");
process.env.NODE_ENV = "test";
for (const [, name] of envSource.matchAll(/"([A-Z0-9_]+)": str required/g)) {
  process.env[name] = "registration-test";
}

const { fromAff } = await import("../output/Control.Promise/index.js");
const { loadLexicons } = await import("../output/Rocksky.Lexicon/index.js");
const { register } = await import("../output/Rocksky.Xrpc.Index/index.js");
const docs = await fromAff(loadLexicons)();
const server = createServer(docs);
const methods = new Map();
const registerMethod = server.method.bind(server);
server.method = (nsid, config) => {
  assert.ok(!methods.has(nsid), `Duplicate registration: ${nsid}`);
  methods.set(nsid, config);
  return registerMethod(nsid, config);
};
const ctx = new Proxy({ authVerifier: () => { throw new Error("Unexpected authentication call"); } }, {
  get(target, key) {
    assert.ok(key in target, `Registration accessed live service: ${String(key)}`);
    return target[key];
  },
});
register(server)(ctx)();

// Compare actual registrations with source handlers so future omissions fail.
const handlersDir = new URL("../api/src/Rocksky/Xrpc/App/Rocksky/", import.meta.url);
const expected = [];
for (const entry of await readdir(handlersDir, { recursive: true })) {
  if (!entry.endsWith(".purs")) continue;
  const source = await readFile(new URL(entry, handlersDir), "utf8");
  for (const [, nsid] of source.matchAll(/Xrpc\.method server "([^"]+)"/g)) expected.push(nsid);
}
assert.ok(expected.length >= 47);
assert.deepEqual([...methods.keys()].sort(), expected.sort());
const originalDir = new URL("../../apps/api/src/xrpc/app/rocksky/", import.meta.url);
const originalNsids = [];
for (const entry of await readdir(originalDir, { recursive: true })) {
  if (!entry.endsWith(".ts")) continue;
  const source = await readFile(new URL(entry, originalDir), "utf8");
  for (const [, nsid] of source.matchAll(/server\.(app\.rocksky\.\w+\.\w+)\s*\(/g)) originalNsids.push(nsid);
}
assert.equal(originalNsids.length, 146);
assert.deepEqual([...methods.keys()].sort(), originalNsids.sort(), "Every original TypeScript XRPC handler is registered");

for (const [nsid, config] of methods) {
  assert.equal(typeof config.handler, "function", nsid);
  if (nsid.startsWith("app.rocksky.library.")) {
    assert.equal(typeof config.auth, "function", `${nsid} must require authentication`);
  }
}
// Ensure the newly reachable deletion handlers reject missing identity before I/O.
for (const name of ["deleteSong", "deleteAlbum"]) {
  const result = await methods.get(`app.rocksky.library.${name}`).handler({ input: { body: { id: "track" } } });
  assert.equal(result.status, 400);
  assert.equal(result.message, "Missing authenticated DID.");
}
console.log(`Verified ${methods.size} XRPC registrations against real lexicons; library authentication and deletion guards passed.`);

const { removeLibraryTrack } = await import("../output/Rocksky.Typesense.Library/index.js");
for (const status of [404, 403, 503]) {
  let calls = 0;
  const failure = Object.assign(new Error("Typesense failure"), { httpStatus: status });
  const context = { typesense: { collections(name) {
    assert.equal(name, "library_tracks");
    return { documents(id) {
      assert.equal(id, "upload-id");
      return { async delete() { calls++; throw failure; } };
    } };
  } } };
  const action = fromAff(removeLibraryTrack(context)("upload-id"))();
  if (status === 404) await action;
  else await assert.rejects(action, err => err === failure);
  assert.equal(calls, status === 503 ? 3 : 1);
}
console.log("Verified index deletion: 404 is idempotent, 403 propagates, 503 retries three times.");

const { presetRkey } = await import("../output/Rocksky.Xrpc.App.Rocksky.Equalizer.Slug/index.js");
for (const [input, expected] of [["Bass Boost", "bass-boost"], ["Treble  Boost", "treble-boost"], ["Rock 'n' Roll!", "rock-n-roll"], ["Café Vibes", "caf-vibes"], ["--My - Preset--", "my-preset"], ["a_b_c", "a-b-c"], ["bass-boost", "bass-boost"], ["!!!", ""], ["   ", ""]]) {
  assert.equal(presetRkey(input), expected);
}
const { mergeSettings } = await import("../output/Rocksky.Xrpc.App.Rocksky.Rockbox.PutAudioSettings/index.js");
const stored = { equalizer: { enabled: true, precut: -3, bands: [1, 2] }, tone: { bass: 5 }, createdAt: "original" };
const merged = mergeSettings({ equalizer: { precut: -6 } })(stored)("now");
assert.deepEqual(merged.equalizer, { enabled: true, precut: -6, bands: [1, 2] });
assert.deepEqual(merged.tone, stored.tone);
assert.equal(merged.createdAt, "original");
assert.equal(merged.updatedAt, "now");
assert.equal(stored.equalizer.precut, -3);
const { makeRecord } = await import("../output/Rocksky.Xrpc.App.Rocksky.Equalizer.PutPreset/index.js");
assert.deepEqual(makeRecord({ bands: [] })({ precut: -4, createdAt: "original" })("Name")("now"), {
  $type: "app.rocksky.equalizer", name: "Name", precut: -4, bands: [], createdAt: "original", updatedAt: "now",
});
for (const nsid of ["app.rocksky.equalizer.listPresets", "app.rocksky.rockbox.getAudioSettings"]) {
  const result = await methods.get(nsid).handler({ params: {} });
  assert.equal(result.status, 401);
  assert.equal(result.error, "AuthRequired");
}
console.log("Verified preset slug parity, sparse audio patches, timestamps and public-read authentication guards.");

for (const [module, routes] of [
  ["Rocksky.Apikeys.App", [["GET", "/"], ["POST", "/"], ["PUT", "/id"], ["DELETE", "/id"]]],
  ["Rocksky.AccessTokens.App", [["GET", "/"], ["POST", "/"], ["DELETE", "/id"]]],
  ["Rocksky.Storage.App", [["GET", "/providers"], ["POST", "/providers"], ["DELETE", "/providers/id"]]],
]) {
  const { app } = await import(`../output/${module}/index.js`);
  const rest = app(ctx)();
  for (const [method, path] of routes) {
    const response = await rest.request(`http://localhost${path}`, { method });
    assert.equal(response.status, 401, `${module}: ${method} ${path}`);
    assert.equal(await response.text(), "Unauthorized");
  }
}
console.log("Verified credential-management REST routes reject unauthenticated calls before I/O.");

for (const [name, expected] of [
  ["getUnreadCount", { count: 0 }],
  ["listNotifications", { notifications: [], unreadCount: 0 }],
  ["updateSeen", { unreadCount: 0 }],
]) {
  const response = await methods.get(`app.rocksky.notification.${name}`).handler({ params: {} });
  assert.deepEqual(response.body, expected);
}
const { notificationSubject } = await import("../output/Rocksky.Notifications.Service/index.js");
assert.equal(notificationSubject("user.name:with/slashes"), "rocksky.notification.user_name_with_slashes");
const { app: notificationApp } = await import("../output/Rocksky.Notifications.Sse/index.js");
assert.equal((await notificationApp(ctx)().request("http://localhost/stream")).status, 401);
console.log("Verified notification anonymous fallbacks, NATS subject isolation, and SSE token guard.");
