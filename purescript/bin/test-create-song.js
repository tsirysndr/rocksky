import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {getTableName} from 'drizzle-orm';
import {Lexicons} from '@atproto/lexicon';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,k] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[k]='create-song-test';
const Service=await import('../output/Rocksky.Xrpc.App.Rocksky.Song.CreateService/index.js');
const Records=await import('../output/Rocksky.Xrpc.App.Rocksky.Song.CreateRecords/index.js');
const Create=await import('../output/Rocksky.Xrpc.App.Rocksky.Song.CreateSong/index.js');
const {fromAff,toAffE}=await import('../output/Control.Promise/index.js');const {loadLexicons}=await import('../output/Rocksky.Lexicon/index.js');const {Nothing}=await import('../output/Data.Maybe/index.js');const run=aff=>fromAff(aff)();
const lexicons=new Lexicons(await run(loadLexicons));const now=new Date('2020-01-01T00:00:00Z');
const track={id:'t',title:'Song',artist:'Artist',album:'Album',albumArtist:'Artist',duration:180000,uri:'song-uri',albumUri:'album-uri',artistUri:'artist-uri',sha256:'hash',createdAt:now,updatedAt:now,xataVersion:1};
const album={id:'a',uri:'album-uri'},artist={id:'ar',uri:'artist-uri'};
const link=(id,fields)=>({id,...fields,createdAt:now,updatedAt:now,xataVersion:1});
const links={album_tracks:link('at',{albumId:'a',trackId:'t'}),artist_tracks:link('art',{artistId:'ar',trackId:'t'}),artist_albums:link('aa',{artistId:'ar',albumId:'a'})};
function mock({stored=track,missing=false,insert=false}={}){
 const reads=[],writes=[],published=[];let pauses=0;const data={tracks:stored,albums:album,artists:artist,...links};
 const ctx={lexicons,nc:{publish(subject,bytes){published.push([subject,JSON.parse(Buffer.from(bytes).toString())])}},db:{
  select(){let table;const q={from(t){table=getTableName(t);return q},where(){return q},async execute(){reads.push(table);if(missing&&table==='tracks')return [];if(insert&&table in links)return [];return [data[table]]}};return q},
  update(t){const table=getTableName(t);const q={set(fields){writes.push([table,fields]);return q},where(){return q},async execute(){}};return q},
  insert(t){const table=getTableName(t);const q={values(fields){writes.push([table,fields]);return q},onConflictDoNothing(){return q},returning(){return q},async execute(){return [links[table]]}};return q},
 }};
 return {ctx,reads,writes,published,get pauses(){return pauses},pause:toAffE(async()=>{pauses++})};
}
{
 const m=mock();const result=await run(Service.saveWithPause(m.pause)(m.ctx)(track)({}));assert.equal(result.tries,1);assert.equal(result.track.id,'t');assert.equal(m.pauses,1);assert.equal(m.writes.length,0);assert.equal(m.published.length,1);
 const [subject,payload]=m.published[0];assert.equal(subject,'rocksky.track');assert.equal(payload.track.sha256,'hash');assert.equal(payload.track.xata_id,'t');assert.equal(payload.track.xata_createdat,now.toISOString());assert.deepEqual(Object.keys(payload.album_track).sort(),['album_id','track_id','xata_createdat','xata_id','xata_updatedat','xata_version']);assert.deepEqual(payload.album_track.album_id,{xata_id:'a'});
}
{
 const m=mock({missing:true});await assert.rejects(run(Service.saveWithPause(m.pause)(m.ctx)(track)({})),/NoSuchElementException/);assert.equal(m.pauses,0);assert.equal(m.writes.length,0);assert.equal(m.published.length,0);
}
{
 const m=mock({insert:true});const result=await run(Service.saveWithPause(m.pause)(m.ctx)(track)({}));assert.equal(result.tries,1);assert.deepEqual(m.writes.map(w=>w[0]),['album_tracks','artist_tracks','artist_albums']);assert.equal(m.published.length,1);
}
{
 const m=mock({stored:{...track,albumUri:null,artistUri:null}});const result=await run(Service.saveWithPause(m.pause)(m.ctx)(track)({}));assert.equal(result.tries,15);assert.equal(m.pauses,15);assert.equal(m.writes.length,32);assert.equal(m.published.length,0);assert.equal(result.track.albumUri,null);
}
{
 const writes=[];const agent={assertDid:'did:plc:user',com:{atproto:{repo:{async putRecord(input){writes.push(input);return {data:{uri:'at://did:plc:user/'+input.collection+'/'+input.rkey,cid:'cid'}}}}}}};
 const input={title:'Song',artist:'Artist',album:'Album',albumArtist:'Artist',duration:180000,discNumber:0,composer:'',lyrics:'',releaseDate:now};
 await run(Records.putArtist({lexicons})(input)(agent));await run(Records.putAlbum({lexicons})(input)(agent));await run(Records.putSong({lexicons})(input)(agent));await run(Records.putSong({lexicons})(input)(agent));
 assert.equal(new Set(writes.map(w=>w.rkey)).size,1);assert.equal(writes[0].rkey,Records.recordKey);assert.equal(writes[2].record.discNumber,1);assert.equal(writes[2].record.lyrics,'');assert.equal(writes[2].record.releaseDate,now.toISOString());assert.equal(writes[2].record.tags,undefined);assert.equal(writes[2].record.artists,undefined);assert.equal(writes[2].validate,false);
 await assert.rejects(run(Records.putSong({lexicons})({...input,title:undefined})(agent)),/Invalid record/);assert.equal(writes.length,4);
}
await assert.rejects(run(Create.create({})(Nothing.value)({})),/Authentication required/);
console.log('Song creation catalog requirements, polling, relationships, NATS payload and validated record-write checks passed');
