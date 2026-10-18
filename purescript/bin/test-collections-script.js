import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {getTableName} from 'drizzle-orm';
import {PgDialect} from 'drizzle-orm/pg-core';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='collections-test';
const C=await import('../output/Rocksky.Scripts.Collections/index.js');const {fromAff,toAffE}=await import('../output/Control.Promise/index.js');const run=a=>fromAff(a)();const aff=f=>toAffE(()=>Promise.resolve().then(f));const dialect=new PgDialect();const sha=s=>createHash('sha256').update(s.toLowerCase()).digest('hex');
const record=(type,value)=>({uri:`at://repo/app.rocksky.${type}/key`,cid:'cid',value});
const artist=record('artist',{name:'Artist',createdAt:'2026-01-01T00:00:00Z',pictureUrl:'https://pic',tags:['rock']});
const album=record('album',{title:'Album',artist:'Artist',albumArtUrl:'https://art',year:2026,releaseDate:'2026-01-01'});
const song=record('song',{title:'Title',artist:'Artist',albumArtist:'Artist',album:'Album',duration:123,mbid:'mb',createdAt:'2026-01-02T00:00:00Z',genre:'rock',trackNumber:2,composer:'Composer'});
const scrobble=record('scrobble',{...song.value,createdAt:'2026-01-03T01:02:03Z'});
function mock(options={}){const calls=[];const entity=t=>({id:`${t}-id`,uri:`at://${t}`});const db={
 select(){let table;const call={kind:'select'};calls.push(call);const q={from(t){table=getTableName(t);call.table=table;return q},where(c){call.query=dialect.sqlToQuery(c);return q},limit(n){assert.equal(n,1);return q},async execute(){if(options.select)return options.select(table,call);return [entity(table)]}};return q},
 insert(t){const table=getTableName(t),call={kind:'insert',table};calls.push(call);const q={values(v){call.values=v;return q},onConflictDoNothing(){call.conflict='nothing';return q},onConflictDoUpdate(v){call.conflict={set:v.set,target:v.target.map(c=>c.name)};return q},returning(){call.returning=true;return q},async execute(){if(options.insert)return options.insert(table,call);return [entity(table)]}};return q}
 };return {db,calls};}
{
 const m=mock(),requests=[],published=[];let scrobblePage=0;
 const agent={com:{atproto:{repo:{async listRecords(q){requests.push(q);const suffix=q.collection.split('.').at(-1);let records={artist:[artist],album:[album],song:[song],scrobble:[scrobble]}[suffix];let cursor;if(suffix==='scrobble'&&scrobblePage++===0){records=[];cursor='page2'}return {data:{records,cursor}}}}}}};
 await run(C.synchronize({db:m.db})('user')('did:plc:user')(agent)(id=>aff(()=>published.push(id))));
 assert.deepEqual(requests.map(q=>q.collection),['app.rocksky.scrobble','app.rocksky.scrobble','app.rocksky.song','app.rocksky.artist','app.rocksky.album']);assert.equal(requests[1].cursor,'page2');assert.ok(requests.every(q=>q.limit===100));
 const inserts=m.calls.filter(c=>c.kind==='insert');assert.deepEqual(inserts.map(c=>c.table),['artists','user_artists','albums','user_albums','artist_albums','tracks','user_tracks','album_tracks','artist_tracks','scrobbles']);
 const art=inserts.find(c=>c.table==='artists').values[0];assert.equal(art.sha256,sha('Artist'));assert.deepEqual(art.genres,['rock']);assert.ok(art.createdAt instanceof Date);
 const alb=inserts.find(c=>c.table==='albums');assert.equal(alb.values[0].sha256,sha('Album - Artist'));assert.deepEqual(alb.conflict.set,{albumArt:'https://art',artistUri:'at://artists',year:2026,releaseDate:'2026-01-01'});assert.equal('createdAt' in alb.values[0],false);
 const track=inserts.find(c=>c.table==='tracks').values[0];assert.equal(track.sha256,sha('Title - Artist - Album'));assert.equal(track.mbId,'mb');assert.equal(track.composer,'Composer');assert.equal(track.artistUri,'at://artists');
 for(const c of inserts.filter(c=>c.table.startsWith('user_')))assert.deepEqual(c.conflict.set,{scrobbles:1});
 const sc=inserts.at(-1).values[0];assert.equal(sc.timestamp.toISOString(),'2026-01-03T01:02:03.000Z');assert.equal(sc.createdAt,sc.timestamp);assert.deepEqual(published,['scrobbles-id']);
}
{
 const m=mock({insert:(table)=>['artists','albums','tracks','scrobbles'].includes(table)?[]:[{id:table+'-id'}]});const published=[];
 await run(C.insertArtists({db:m.db})('user')([artist]));await run(C.insertAlbums({db:m.db})('user')([album]));await run(C.insertSongs({db:m.db})('user')([song]));await run(C.insertScrobbles({db:m.db})('user')(id=>aff(()=>published.push(id)))([scrobble]));
 const fallback=m.calls.filter(c=>c.kind==='select');assert.ok(fallback.some(c=>c.table==='tracks'&&c.query.sql.includes(' or ')));const sc=fallback.find(c=>c.table==='scrobbles');assert.match(sc.query.sql,/timestamp.*or.*uri/);assert.equal(sc.query.params[0],'user');assert.deepEqual(published,['scrobbles-id']);
}
{
 const m=mock({select:()=>[]});await run(C.insertSongs({db:m.db})('user')([song]));assert.equal(m.calls.some(c=>c.kind==='insert'),false);await assert.rejects(run(C.insertArtists({db:mock({insert:()=>[],select:()=>[]}).db})('user')([artist])),/dependency/);
}
{
 const m=mock({insert:()=>{throw Error('insert failed')}});await run(C.insertSongs({db:m.db})('user')([song]));await assert.rejects(run(C.insertScrobbles({db:m.db})('user')(()=>aff(()=>{}))([scrobble])),/insert failed/);
 const ok=mock();await run(C.insertScrobbles({db:ok.db})('user')(()=>aff(()=>{throw Error('publish failed')}))([scrobble]));
}
console.log('Collections script: cursor pagination, dependency order, hashes, metadata, upserts, conflict recovery, source error boundaries and publication passed');
