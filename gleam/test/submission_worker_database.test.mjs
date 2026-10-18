import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { createTables } from './helpers/postgres.mjs';
import { Ok, Error as GError } from '../build/dev/javascript/rocksky_api/gleam.mjs';
import { app_with_agent_factory } from '../build/dev/javascript/rocksky_api/rocksky_api/submissions/app.mjs';
import { PdsSessionExpired } from '../build/dev/javascript/rocksky_api/rocksky_api/error.mjs';
const did='did:plc:abcdefghijklmnopqrstuvwx',secret='s'.repeat(32);
test('Internal workers authenticate, validate persisted work, confirm recovery, and recheck mirror preferences', {skip:!process.env.GLEAM_TEST_PGHOST},async()=>{
 const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
 try {
  await createTables(pool,['users','mirror_sources']);
  await pool.query("INSERT INTO users (xata_id,did,handle,display_name,avatar) VALUES ('u',$1,'u.test','User','')",[did]);
  await pool.query("INSERT INTO mirror_sources (user_id,provider,enabled,push_enabled) VALUES ('u','tealfm',true,false)");
  let calls=0,expired=false;
  const mock={did,com:{atproto:{repo:{getRecord:async p=>({data:{uri:`at://${did}/${p.collection}/${p.rkey}`,cid:'cid',value:{}}})}}}};
  const ctx={db:{pool},env:{submissions_secret:secret,disabled_tealfm:''}};
  const app=app_with_agent_factory(ctx,async()=>{calls++;return expired?new GError(new PdsSessionExpired()):new Ok(mock);});
  const body={did,submissionId:'a'.repeat(64),recordKey:'3mv234567abcd',track:{title:'Song',artist:'Artist',album:'Album',albumArtist:'Artist',duration:100,timestamp:1700000000}};
  const call=(path,payload=body,token=secret)=>app.request(path,{method:'POST',headers:{'content-type':'application/json','x-rocksky-submissions-secret':token},body:JSON.stringify(payload)});
  assert.equal((await call('/process',body,'bad')).status,401);assert.equal(calls,0);
  assert.equal((await call('/process',{...body,submissionId:'bad'})).status,400);
  assert.equal((await call('/process',{...body,recordKey:'bad'})).status,400);
  assert.equal((await call('/process',{...body,track:{...body.track,timestamp:0}})).status,400);
  const recovered=await call('/process');assert.equal(recovered.status,200);assert.equal((await recovered.json()).status,'published');assert.equal(calls,1);
  expired=true;assert.equal((await call('/process')).status,401);
  const before=calls;
  assert.equal((await call('/tealfm/process',{...body,track:{$type:'fm.teal.feed.play',trackName:'Song',playedTime:'2026-10-15T15:00:00Z',custom:'preserved'}})).status,200);assert.equal(calls,before);
 } finally {await pool.end();}
});
