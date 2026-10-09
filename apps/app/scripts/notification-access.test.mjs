import assert from "node:assert/strict";
import test from "node:test";
import { createNotificationAccessCheck } from "../src/lib/notificationAccess.ts";

function setup(granted = false) {
  const state = { granted, opens: 0, reads: 0, errors: [] };
  const check = createNotificationAccessCheck({
    hasAccess: async () => { state.reads++; return state.granted; },
    openSettings: async () => { state.opens++; },
    onError: error => state.errors.push(error),
  });
  return { check, state };
}

test("denial does not loop on returning from settings, but the next visit retries", async () => {
  const { check, state } = setup();
  await check.resume();
  assert.equal(state.opens, 1);
  check.pause();
  await check.resume();
  assert.equal(state.reads, 2);
  assert.equal(state.opens, 1);
  check.pause();
  await check.resume();
  assert.equal(state.opens, 2);
});

test("grant stops redirects and a later revocation is detected", async () => {
  const { check, state } = setup();
  await check.resume();
  check.pause();
  state.granted = true;
  await check.resume();
  check.pause();
  await check.resume();
  assert.equal(state.opens, 1);
  check.pause();
  state.granted = false;
  await check.resume();
  assert.equal(state.opens, 2);
});

test("already granted access never opens settings", async () => {
  const { check, state } = setup(true);
  await check.resume();
  assert.equal(state.opens, 0);
});

for (const reason of ["pause", "dispose"]) {
  test(`a delayed check cannot redirect after ${reason}`, async () => {
    let resolve;
    let opens = 0;
    const check = createNotificationAccessCheck({
      hasAccess: () => new Promise(done => { resolve = done; }),
      openSettings: async () => { opens++; },
      onError: error => { throw error; },
    });
    const pending = check.resume();
    check[reason]();
    resolve(false);
    await pending;
    assert.equal(opens, 0);
  });
}

test("overlapping checks only let the latest foreground visit redirect", async () => {
  const resolvers = [];
  let opens = 0;
  const check = createNotificationAccessCheck({
    hasAccess: () => new Promise(resolve => resolvers.push(resolve)),
    openSettings: async () => { opens++; },
    onError: error => { throw error; },
  });
  const first = check.resume();
  check.pause();
  const second = check.resume();
  resolvers[1](false);
  await second;
  resolvers[0](false);
  await first;
  assert.equal(opens, 1);
});

test("a settings launch failure can retry on the next visit", async () => {
  let opens = 0;
  const errors = [];
  const check = createNotificationAccessCheck({
    hasAccess: async () => false,
    openSettings: async () => { if (++opens === 1) throw new Error("No settings activity"); },
    onError: error => errors.push(error),
  });
  await check.resume();
  assert.equal(errors.length, 1);
  check.pause();
  await check.resume();
  assert.equal(opens, 2);
});
