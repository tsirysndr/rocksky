import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import axios from 'axios';
import { createTables } from './helpers/postgres.mjs';
import { Ok } from '../build/dev/javascript/rocksky_api/gleam.mjs';
import { Some, None } from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';
import { Fail, Json } from '../build/dev/javascript/rocksky_api/rocksky_api/node/xrpc_server.mjs';
import { submit } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/scrobble/create_scrobble.mjs';
test('Scrobble endpoint rejects blocked users and expired sessions before durable acceptance', {skip:!process.env.GLEAM_TEST_PGHOST},async()=>{
 const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
 const original=axios.defaults.adapter;
 try {
  await createTables(pool,['users']);
  await pool.query("INSERT INTO users (xata_id,did,handle,display_name,avatar,is_bot) VALUES ('u','did:plc:user','u.test','User','',false)");
  let ttl=-2,accepted=0,agentCalls=0,queued;
  const ctx={db:{pool},redis:{ttl:async()=>ttl},env:{scrobble_abuse_max:100,submissions_url:'https://queue.test',submissions_secret:'s'.repeat(32)}};
  axios.defaults.adapter=async config=>{assert.equal(config.url,'https://queue.test/v1/submissions');accepted++;queued=JSON.parse(config.data);return {status:202,data:{id:'a'.repeat(64)},headers:{}};};
  const factory=async()=>{agentCalls++;return new Ok(new Some({}));};
  const track={title:'Song',artist:'Artist',albumArtist:'Artist',album:'Album',duration:100,timestamp:1700000000};
  const call=(headers={},f=factory,body=track,did=new Some('did:plc:user'))=>submit(ctx,did,body,headers,f);
  assert.equal((await call({},factory,track,new None())).status,400);
  assert.equal((await call({},factory,{title:'Only'})).status,400);
  await pool.query("UPDATE users SET is_bot=true");assert.equal((await call()).status,429);assert.equal(agentCalls,0);
  await pool.query("UPDATE users SET is_bot=false");ttl=120;assert.equal((await call()).status,429);assert.equal(agentCalls,0);ttl=-2;
  assert.equal((await call({},async()=>new Ok(new None()))).status,401);
  assert.equal((await call({'idempotency-key':['a','b']})).status,400);
  assert.equal((await call({'idempotency-key':'x'.repeat(513)})).status,400);assert.equal(accepted,0);
  const response=await call({'idempotency-key':'stable','x-rocksky-mirror-provider':'tealfm'});assert.ok(response instanceof Json,JSON.stringify(response));
  assert.equal(accepted,1);assert.equal(queued.idempotencyKey,'stable');assert.equal(queued.skipTeal,true);assert.equal(queued.track.timestamp,track.timestamp);
  axios.defaults.adapter=async()=>({status:500,data:{},headers:{}});
  assert.equal((await call()).status,503);
 } finally {axios.defaults.adapter=original;await pool.end();}
});
