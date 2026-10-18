import assert from 'node:assert/strict';
import { test } from 'node:test';
import axios from 'axios';
import { Ok } from '../build/dev/javascript/rocksky_api/gleam.mjs';
import { Some, None } from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';
import { run } from '../build/dev/javascript/gleam_stdlib/gleam/dynamic/decode.mjs';
import * as status from '../build/dev/javascript/rocksky_api/rocksky_api/subscribers/status.mjs';
const settle=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
test('Playback status handles source handoff, deferred stops, expiry and rate limits',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1700000000000});
 const writes=[],deletes=[],redisDeletes=[];let stored,fail;
 const agent={did:'did:plc:test',com:{atproto:{repo:{
  getRecord:async()=>{if(!stored)throw {status:404};return {data:stored};},
  putRecord:async p=>{if(fail)throw fail;writes.push(p);stored={uri:'at://status',cid:'cid'+writes.length,value:p.record};return {data:stored};},
  deleteRecord:async p=>{deletes.push(p);stored=undefined;return {};}
 }}}};
 const factory=async()=>new Ok(new Some(agent));
 const ctx={redis:{del:async(...keys)=>{redisDeletes.push(...keys.flat());return 1;}},matching:axios.create({adapter:async config=>({status:200,headers:{},data:{status:'unmatched',policyVersion:'1',track:null,candidates:[]},config})})};
 const state=status.new$();
 const parse=raw=>{const result=run(raw,status.raw_decoder());assert.ok(result instanceof Ok);return result[0];};
 const raw=parse({name:'Song',artist:'Artist',album:'Album',source:'rockbox',duration_ms:20000,track_number:0});
 await status.changed(ctx,state,agent.did,raw,factory);assert.equal(writes.length,1);assert.equal(writes[0].swapRecord,undefined);assert.equal(writes[0].record.track.trackNumber,undefined);
 await status.changed(ctx,state,agent.did,raw,factory);assert.equal(writes.length,1);
 await status.stopped(state,agent.did,factory);t.mock.timers.tick(1000);await settle();assert.equal(deletes.length,0);
 const nav=parse({name:'Song',artist:'Artist',album:'Album',source:'navidrome',duration_ms:20000,trackNumber:3});
 await status.changed(ctx,state,agent.did,nav,factory);assert.equal(writes.length,2);assert.equal(writes[1].swapRecord,'cid1');assert.deepEqual(redisDeletes,['ws_lastsong:'+agent.did]);
 t.mock.timers.tick(24000);await settle();assert.equal(deletes.length,0,'old stop cancelled');
 await status.stopped(state,agent.did,factory);assert.equal(deletes.length,1);
 await status.stopped(state,agent.did,factory);assert.equal(deletes.length,1,'already stopped');
 fail={response:{status:429,headers:{'retry-after':'60'}}};await status.changed(ctx,state,agent.did,raw,factory);assert.equal(status.is_rate_limited(state,agent.did,Date.now()),true);
 fail=undefined;await status.changed(ctx,state,agent.did,raw,factory);assert.equal(writes.length,2);
 t.mock.timers.tick(60001);await status.changed(ctx,state,agent.did,raw,factory);assert.equal(writes.length,3);
 await status.stopped(state,agent.did,factory);t.mock.timers.tick(25000);await settle();assert.equal(deletes.length,2,'stop clears after duration and grace');
 const spotify=parse({name:'Other',artists:[{name:'Band'}],album:{name:'Release',cover:'https://cover'},duration_ms:1000});
 const normalized=status.normalize(spotify,new None(),new Some('https://other'),new Some(2));assert.equal(normalized.source,'spotify');assert.equal(normalized.artist,'Band');assert.equal(normalized.albumCoverUrl,'https://cover');
 await status.changed(ctx,state,agent.did,spotify,factory);t.mock.timers.tick(11001);await settle();await status.changed(ctx,state,agent.did,spotify,factory);assert.equal(writes.length,5,'expired dedup allows replay');
});
