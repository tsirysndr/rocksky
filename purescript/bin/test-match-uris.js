import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {getTableName} from 'drizzle-orm';
import {PgDialect} from 'drizzle-orm/pg-core';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='match-test';
const {catalogIdentity}=await import('../output/Rocksky.Xrpc.App.Rocksky.Song.MatchSongUris/index.js');
const {fromAff}=await import('../output/Control.Promise/index.js');const {Just,Nothing}=await import('../output/Data.Maybe/index.js');const run=aff=>fromAff(aff)();
const candidate={source:'spotify',id:'provider',title:'Karma Police',artists:['Radiohead'],album:'OK Computer',albumArtist:'Radiohead',durationMs:264066,identifiers:{isrc:'GBAYE9701368'}};
const record={id:'catalog',title:'Karma Police',artist:'Radiohead',album:'OK Computer',albumArtist:'Radiohead',duration:264000,isrc:'GBAYE9701368',uri:'song-uri',albumUri:null,artistUri:null};
function context(track=record,fail=false){const lookups=[],dialect=new PgDialect();return {lookups,ctx:{readDb:{select(){let table;const q={from(t){table=getTableName(t);return q},where(c){const sql=dialect.sqlToQuery(c);assert.match(sql.sql,/"sha256"/);lookups.push(sql.params);return q},limit(){return q},async execute(){if(table==='tracks'){if(fail)throw Error('offline');return track?[track]:[]}if(table==='albums')return [{title:'OK Computer',artist:'Radiohead',uri:'album-uri'}];if(table==='artists')return [{name:'Radiohead',uri:'artist-uri'}];throw Error('unexpected table')}};return q}}}};}
{
 const {ctx,lookups}=context();const result=await run(catalogIdentity(ctx)(candidate)(Nothing.value));assert.equal(result.record.value0.id,'catalog');assert.equal(result.uri,'song-uri');assert.equal(result.albumUri,'album-uri');assert.equal(result.artistUri,'artist-uri');
 assert.deepEqual(lookups,['karma police - radiohead - ok computer','ok computer - radiohead','radiohead'].map(s=>[createHash('sha256').update(s).digest('hex')]));
}
for(const change of [{isrc:'OTHER'},{title:'Different'},{album:'OK Computer (Remastered)'},{duration:300000},{mbId:'wrong'}]){
 const {ctx}=context({...record,...change});const c=change.mbId?{...candidate,identifiers:{...candidate.identifiers,musicbrainzRecordingId:'expected'}}:candidate;
 const result=await run(catalogIdentity(ctx)(c)(Nothing.value));assert.equal(result.uri,null);assert.ok(result.record instanceof Nothing);assert.equal(result.albumUri,'album-uri');assert.equal(result.artistUri,'artist-uri');
}
{
 const {ctx}=context({...record,isrc:'gb-aye-97-01368'});assert.equal((await run(catalogIdentity(ctx)(candidate)(Nothing.value))).uri,'song-uri');
}
{
 const {ctx}=context(record,true);const result=await run(catalogIdentity(ctx)(candidate)(Nothing.value));assert.equal(result.uri,null);assert.equal(result.albumUri,'album-uri');assert.equal(result.artistUri,'artist-uri');
}
{
 const {ctx,lookups}=context();const result=await run(catalogIdentity(ctx)({...candidate,album:'Compilation'})(new Just({...record,albumUri:'original-album'})));assert.equal(result.uri,'song-uri');assert.equal(result.albumUri,null);assert.equal(lookups.length,2);
}
{
 const {ctx,lookups}=context();const result=await run(catalogIdentity(ctx)({...candidate,album:undefined})(Nothing.value));assert.equal(result.uri,null);assert.equal(result.albumUri,null);assert.equal(result.artistUri,'artist-uri');assert.equal(lookups.length,1);
}
console.log('Song match hash lookups, conflicting identities, duration checks, settled failures and joined-release URI checks passed');
