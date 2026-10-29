import test from 'node:test';
import assert from 'node:assert/strict';
import { deliver, messageFor, saveDevice } from '../build/dev/javascript/rocksky_api/rocksky_api/notifications/push_ffi.mjs';

test('FCM payload uses the social channel and opens alerts, without comment contents', () => {
  const message = messageFor({id: 'n1', type: 'mention', actor: {displayName:'Alice'}, shoutContent:'private text'});
  assert.equal(message.notification.body, 'Alice mentioned you');
  assert.equal(message.android.notification.channelId, 'social');
  assert.deepEqual(JSON.parse(message.data.body), {notificationId: 'n1', screen:'Alerts'});
  assert.ok(!JSON.stringify(message).includes('private text'));
});
test('delivery splits multicast batches and only removes permanently invalid tokens for the recipient', async () => {
  const calls = [];
  const db = {pool: {query: async (sql, args) => {
    calls.push({sql,args});
    return {rows: sql.startsWith('SELECT') ? Array.from({length:501},(_,i)=>({token:`t${i}`})) : []};
  }}};
  const batches = [];
  await deliver(db, 'u1', {id:'n1',type:'follow'}, {sendEachForMulticast: async message => {
    batches.push(message.tokens.length);
    return {failureCount:2, responses:message.tokens.map((_,i)=> i===0
      ? {error:{code:'messaging/registration-token-not-registered'}}
      : i===1 ? {error:{code:'messaging/server-unavailable'}} : {success:true})};
  }});
  assert.deepEqual(batches,[500,1]);
  assert.deepEqual(calls[1].args,['u1',['t0']]);
  assert.deepEqual(calls[2].args,['u1',['t500']]);
});
test('unregister is scoped to the authenticated owner; registration reassigns a device on account switch', async () => {
  const calls = [];
  const db = {pool:{query: async (...args) => calls.push(args)}};
  await saveDevice(db,'u1','token',true);
  await saveDevice(db,'u2','token',false);
  assert.match(calls[0][0], /token = \$1 AND user_id = \$2/);
  assert.deepEqual(calls[0][1],['token','u1']);
  assert.match(calls[1][0], /ON CONFLICT.*DO UPDATE/s);
  assert.deepEqual(calls[1][1],['token','u2']);
});
