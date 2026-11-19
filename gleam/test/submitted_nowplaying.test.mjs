import assert from 'node:assert/strict';
import {test} from 'node:test';
import {get,from_json} from '../build/dev/javascript/rocksky_api/rocksky_api/nowplaying/submitted.mjs';
import {Ok} from '../build/dev/javascript/rocksky_api/gleam.mjs';

test('ListenBrainz submissions expose playback metadata, clamp elapsed and default optional fields', async()=>{
 for(const [info,inserted,elapsed,device] of [[{duration_ms:20000,music_service_name:'Pano',submission_client:'client'},1700000000,10000,'Pano'],[{duration_ms:5000,submission_client:'client'},1700000000,5000,'client'],[{duration_ms:20000},1700000020,0,null],[{},1700000000,0,null]]) {
  const raw=JSON.stringify({inserted_at:inserted,track_metadata:{track_name:'Song',artist_name:'Artist',additional_info:info}});
  assert.deepEqual(from_json(raw,1700000010000),{title:'Song',artist:'Artist',length:info.duration_ms??0,elapsed,is_playing:true,device_name:device});
 }
 assert.deepEqual(from_json(JSON.stringify({track_metadata:{track_name:'Song',artist_name:'Artist'}}),1700000010000),{title:'Song',artist:'Artist',length:0,elapsed:0,is_playing:true,device_name:null});
 const keys=[];
 const result=await get({redis:{async get(key){keys.push(key);return null;}}},'did:test');
 assert.ok(result instanceof Ok);
 assert.deepEqual(result[0],{});
 assert.deepEqual(keys,['listenbrainz:playing_now:did:test']);
});
