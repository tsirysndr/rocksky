import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Ok, toList } from '../build/dev/javascript/rocksky_api/gleam.mjs';
import { Some, None } from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';
import { TrackArtist } from '../build/dev/javascript/rocksky_api/rocksky_api/lib/track.mjs';
import { MusicbrainzTrack,teal_record,publish_teal_record,publish_teal_status,encode } from '../build/dev/javascript/rocksky_api/rocksky_api/tealfm/publication.mjs';
const now=Date.parse('2026-10-15T15:00:00Z'),key='3mv234567abcd';
const play=teal_record(new MusicbrainzTrack('','','September',toList([new TrackArtist(new None(),'Earth, Wind & Fire')]),'The Best',new Date(now).toISOString()),215);
function pds(){
 const records=new Map(),writes=[];const state={lose:false,failStatus:false,race:false,failRead:false};
 const agent={did:'did:plc:test',com:{atproto:{repo:{
  getRecord:async p=>{if(state.failRead)throw new Error('PDS unavailable');const data=records.get(p.collection+'/'+p.rkey);if(!data)throw Object.assign(new Error('missing'),{error:'RecordNotFound'});return {data};},
  listRecords:async p=>({data:{records:[...records.entries()].filter(([k])=>k.startsWith(p.collection+'/')).map(([,v])=>v)}}),
  putRecord:async p=>{const id=p.collection+'/'+p.rkey,status=p.rkey==='self';if(status&&state.failStatus)throw new Error('status unavailable');if(status&&state.race){state.race=false;records.set(id,{uri:id,cid:'newer',value:{time:new Date(now+1000).toISOString()}});}assert.equal(p.swapRecord,records.get(id)?.cid??null);writes.push(p);const data={uri:id,cid:'cid-'+writes.length,value:p.record};records.set(id,data);if(!status&&state.lose){state.lose=false;throw new Error('lost ack');}return {data};}
 }}}};return {records,writes,state,agent};
}
test('Teal durable publication recovers lost acknowledgements, retries status, and preserves listening time',async()=>{
 assert.ok(play instanceof Ok,JSON.stringify(play));
 const mock=pds();mock.state.lose=true;
 assert.ok((await publish_teal_record(mock.agent,play[0],key,new Some(now))) instanceof Ok);
 assert.ok((await publish_teal_record(mock.agent,play[0],key,new Some(now+5000))) instanceof Ok);
 assert.equal(mock.writes.length,2);assert.equal(mock.writes[0].rkey,key);assert.equal(mock.writes[1].record.expiry,new Date(now+600000).toISOString());
 const retry=pds();retry.state.failStatus=true;assert.ok(!((await publish_teal_record(retry.agent,play[0],key,new Some(now))) instanceof Ok));retry.state.failStatus=false;
 assert.ok((await publish_teal_record(retry.agent,play[0],key,new Some(now+1000))) instanceof Ok);assert.equal(retry.writes.length,2);
 const historical=pds();assert.ok((await publish_teal_record(historical.agent,play[0],key,new Some(now+600000))) instanceof Ok);assert.equal(historical.writes.length,1);
 const race=pds();race.state.race=true;assert.ok(!((await publish_teal_status(race.agent,play[0],now)) instanceof Ok));assert.ok((await publish_teal_status(race.agent,play[0],now)) instanceof Ok);assert.equal(race.writes.length,0);
 const failed=pds();failed.state.failRead=true;assert.ok(!((await publish_teal_record(failed.agent,play[0],key,new Some(now))) instanceof Ok));assert.equal(failed.writes.length,0);
 const duplicate=pds();duplicate.records.set('fm.teal.feed.play/external',{uri:'external',cid:'external',value:encode(play[0],'fm.teal.feed.play')});assert.ok((await publish_teal_record(duplicate.agent,play[0],key,new Some(now))) instanceof Ok);assert.equal(duplicate.writes.length,0);
});
