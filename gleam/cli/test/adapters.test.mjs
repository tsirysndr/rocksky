import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {database,sync,sdk,cache,native,settings,Ok,toList} from '../dist/test-support.mjs';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rocksky-adapters-'));
process.env.ROCKSKY_CLI_DATA_DIR=path.join(tmp,'data');
process.env.ROCKSKY_CACHE_DIR=path.join(tmp,'cache');
after(()=>fs.rmSync(tmp,{recursive:true,force:true}));

test('SQLite migrates and materializes repository records idempotently',async()=>{
 const db=await database.open();
 const did='did:plc:test';
 const record=(kind,key,data)=>({collection:`app.rocksky.${kind}`,uri:`at://${did}/app.rocksky.${kind}/${key}`,cid:'cid',record:data});
 const records=toList([
  record('artist','a',{name:'Artist',tags:['rock']}),
  record('album','a',{title:'Album',artist:'Artist'}),
  record('song','s',{title:'Song',artist:'Artist',albumArtist:'Artist',album:'Album',duration:100000}),
  record('scrobble','p',{title:'Song',artist:'Artist',album:'Album',createdAt:'2025-01-01T00:00:00Z'}),
 ]);
 try{
  database.transaction(db,()=>sync.materialize(db,did,records));
  database.transaction(db,()=>sync.materialize(db,did,records));
  for(const table of ['users','artists','albums','tracks','scrobbles','genres','artist_genres ','album_tracks','user_artists','user_albums','user_tracks']){
   assert.equal(Array.from(database.query(db,`SELECT count(*) AS n FROM "${table}"`,toList([])))[0].n,1,table);
  }
  assert.equal(Array.from(database.query(db,'SELECT timestamp FROM scrobbles',toList([])))[0].timestamp,Date.parse('2025-01-01T00:00:00Z')/1000);
 }catch(e){throw new Error(e.message,{cause:e});}finally{database.close(db);}
});

test('SDK adapter serializes identical plays and ignores album changes',async()=>{
 let writes=0;
 const agent={did:'did:plc:test',useIndex(index){this.index=index;},async scrobble(record){
  writes++;await new Promise(r=>setTimeout(r,10));const uri=`at://${this.did}/app.rocksky.scrobble/${writes}`;
  await this.index.recordScrobble(this.did,record.title,record.artist,record.album,Date.parse(record.createdAt)/1000,uri);return uri;
 }};
 const opened=await sdk.open_index(agent,path.join(tmp,'index'),sdk.play_key);
 assert.ok(opened instanceof Ok,opened[0]);
 try{
  const record={title:'Café',artist:'Artist',album:'First',createdAt:'2025-01-01T00:00:00Z'};
  const uris=await Promise.all([agent.scrobble(record),agent.scrobble({...record,title:' CAFE\u0301 ',album:'Deluxe'})]);
  assert.equal(writes,1);assert.equal(uris[0],uris[1]);
  await opened[0].applyCommit(agent.did,'app.rocksky.scrobble','delete','1',null);
  await agent.scrobble(record);assert.equal(writes,2);
 }finally{await sdk.close(opened[0]);}
});

test('cache downloads atomically, deduplicates concurrent requests and preserves failures',async()=>{
 const fetch=global.fetch;let requests=0;
 global.fetch=async()=>{requests++;return new Response('audio');};
 const track={uploadId:'id/with spaces',mimeType:'audio/flac'};
 try{
  const resolve=async()=>new Ok('https://example.invalid/audio');
  const result=await Promise.all([cache.store(track,resolve),cache.store(track,resolve)]);
  assert.ok(result.every(x=>x instanceof Ok));assert.equal(requests,1);
  assert.equal(fs.readFileSync(cache.find(track),'utf8'),'audio');
  assert.equal(fs.readdirSync(process.env.ROCKSKY_CACHE_DIR).some(x=>x.endsWith('.part')),false);
  global.fetch=async()=>new Response('failed',{status:503});
  assert.ok(!((await cache.store({trackId:'failed'},resolve)) instanceof Ok));
  assert.equal(cache.find({trackId:'failed'}),'');
  cache.clear();assert.equal(cache.total(),0);
 }finally{global.fetch=fetch;}
});

test('Rockbox settings binding preserves crossfade argument order and all EQ bands',()=>{
 const calls=[];const engine=new Proxy({}, {get:(_,key)=>(...args)=>calls.push([key,...args])});
 const s=settings.defaults();
 native.configure(engine,s);
 assert.equal(calls.filter(x=>x[0]==='setEqBand').length,10);
 assert.deepEqual(calls.find(x=>x[0]==='setCrossfade'),['setCrossfade',s.crossfade,s.fade_in_delay*1000,s.fade_in_duration*1000,s.fade_out_delay*1000,s.fade_out_duration*1000,s.mix_mode]);
 native.queue(engine,toList(['a','b']),1);
 assert.deepEqual(calls.slice(-3),[['setQueue',['a','b']],['play'],['skipTo',1]]);
});
