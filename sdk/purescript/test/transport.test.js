import test from "node:test";
import assert from "node:assert/strict";
import { fetchImpl } from "../src/Rocksky/Client.js";
import { omitMissing } from "../src/Rocksky/Internal/Encoding.js";

function request({ baseUrl = "https://example.test/prefix/", token = "", method = "GET", timeout = 1000, nsid = "app.rocksky.test", params = {}, body, hasBody = body !== undefined } = {}) {
  let cancel;
  const promise = new Promise((resolve, reject) => {
    cancel = fetchImpl(baseUrl)(token)(method)(timeout)(nsid)(params)(body ?? null)(hasBody)(reject, resolve);
  });
  return { promise, cancel: () => cancel(new Error("cancel"), assert.fail, () => {}) };
}

test("query encoding preserves repeated values, booleans, zero and empty strings", async t => {
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url.pathname, "/prefix/xrpc/app.rocksky.test");
    assert.deepEqual(url.searchParams.getAll("ids"), ["a&b", "c/d"]);
    assert.equal(url.searchParams.get("enabled"), "false");
    assert.equal(url.searchParams.get("offset"), "0");
    assert.equal(url.searchParams.get("text"), "");
    assert.equal(url.searchParams.has("missing"), false);
    assert.equal(init.headers.authorization, "Bearer secret");
    assert.equal(init.redirect, "error");
    assert.equal(init.body, undefined);
    return new Response('{"ok":true}');
  });
  assert.deepEqual(await request({ token: "secret", params: { ids: ["a&b", "c/d"], enabled: false, offset: 0, text: "", missing: null } }).promise, { status: 200, body: '{"ok":true}' });
});

test("raw JSON body retains explicit null and sets content-type", async t => {
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    assert.equal(init.method, "POST");
    assert.equal(init.headers["content-type"], "application/json");
    assert.equal(init.headers.authorization, undefined);
    assert.equal(init.body, '{"value":null}');
    return new Response(null, { status: 204 });
  });
  assert.equal((await request({ method: "POST", body: { value: null } }).promise).status, 204);
});

test("network failures propagate", async t => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("offline"); });
  await assert.rejects(request().promise, /offline/);
});

test("timeout aborts fetch including response body reads", async t => {
  let signal;
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    signal = init.signal;
    return { status: 200, text: () => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })) };
  });
  await assert.rejects(request({ timeout: 10 }).promise, /timed out/);
  assert.equal(signal.aborted, true);
});

test("cancellation aborts work and suppresses completion callbacks", async t => {
  let signal;
  let callbacks = 0;
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    signal = init.signal;
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  });
  const pending = request();
  pending.promise.then(() => callbacks++, () => callbacks++);
  await new Promise(resolve => setImmediate(resolve));
  pending.cancel();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(signal.aborted, true);
  assert.equal(callbacks, 0);
});

test("invalid URLs, NSIDs, query objects and timeouts fail before fetch", async t => {
  const mock = t.mock.method(globalThis, "fetch", async () => { throw new Error("unexpected fetch"); });
  for (const options of [
    { baseUrl: "file:///tmp/private" }, { baseUrl: "https://name:password@example.test" },
    { baseUrl: "https://example.test?secret=1" }, { nsid: "../escape" },
    { timeout: 0 }, { params: null }, { params: { nested: {} } },
  ]) await assert.rejects(request(options).promise);
  assert.equal(mock.mock.callCount(), 0);
});

test("optional field encoding preserves required nulls, array values and original input", () => {
  const input = { optional: null, required: null, nested: { absent: null, present: false }, items: [{ absent: null, value: 0 }], raw: { null: null } };
  const output = omitMissing([["optional"], ["nested", "absent"], ["items", "*", "absent"]])(input);
  assert.deepEqual(output, { required: null, nested: { present: false }, items: [{ value: 0 }], raw: { null: null } });
  assert.equal(Object.hasOwn(input, "optional"), true);
  assert.equal(Object.hasOwn(input.items[0], "absent"), true);
});
