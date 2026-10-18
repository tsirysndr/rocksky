import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { setImmediate as turn } from 'node:timers/promises';
import { createTables } from './helpers/postgres.mjs';
import { app } from '../build/dev/javascript/rocksky_api/rocksky_api/notifications/sse.mjs';
test('Notification streams prime unread counts, forward messages and unsubscribe on disconnect', {skip:!process.env.GLEAM_TEST_PGHOST},async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
 let next,unsubscribed=0,subject;
 const subscription={unsubscribe(){unsubscribed++;next?.({done:true});},[Symbol.asyncIterator](){return {next:()=>new Promise(resolve=>{next=resolve;})};}};
 try {
 await createTables(pool,['users','notifications']);await pool.query("INSERT INTO users(xata_id,did,handle,display_name,avatar) VALUES ('u','did:plc:user','u.test','User','')");
 const ctx={db:{pool},env:{jwt_secret:'secret'},nc:{subscribe:s=>{subject=s;return subscription;}}};
 const server=app(ctx);assert.equal((await server.request('/stream')).status,401);assert.equal((await server.request('/stream?token=invalid')).status,401);
 const token=jwt.sign({did:'did:plc:user'},'secret');const response=await server.request('/stream?token='+token);assert.match(response.headers.get('content-type'),/text\/event-stream/);
 const reader=response.body.getReader(),text=new TextDecoder();assert.match(text.decode((await reader.read()).value),/event: unread\ndata: {"unreadCount":0}/);
 await turn();assert.ok(next);next({done:false,value:{data:new TextEncoder().encode('{"kind":"like"}')}});
 assert.match(text.decode((await reader.read()).value),/event: notification\ndata: {"kind":"like"}/);
 await reader.cancel();await turn();assert.equal(unsubscribed,1);t.mock.timers.tick(25000);await turn();assert.ok(subject.includes('u'));
 } finally {await pool.end();}
});
