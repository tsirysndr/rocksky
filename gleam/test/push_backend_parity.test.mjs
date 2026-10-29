import test from 'node:test';
import assert from 'node:assert/strict';
import * as gleam from '../build/dev/javascript/rocksky_api/rocksky_api/notifications/push_ffi.mjs';
import * as typescript from '../../apps/api/src/notifications/push-runtime.mjs';
import * as purescript from '../../purescript/api/src/Rocksky/Notifications/Push.js';

test('all backends use the same token ownership SQL and parameters', async () => {
  const calls = [];
  const pool = {query: async (...args) => { calls.push(args); return {rows:[]}; }};
  for (const remove of [false,true]) {
    calls.length=0;
    await gleam.saveDevice({pool},'user','token',remove);
    await typescript.saveDevice({pool},'user','token',remove);
    await purescript.saveDeviceImpl(pool)('user')('token')(remove)();
    assert.deepEqual(calls[0],calls[1]);
    assert.deepEqual(calls[0],calls[2]);
  }
});
test('Gleam and TypeScript produce identical Expo-compatible FCM payloads', () => {
  for (const type of ['follow','mention','like_scrobble','reply','unknown']) {
    const notification={id:'n',type,actor:{handle:'alice'}};
    assert.deepEqual(gleam.messageFor(notification),typescript.messageFor(notification));
  }
});
