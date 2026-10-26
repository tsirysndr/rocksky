import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {getTableName} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/node-postgres';
import {PgDialect} from 'drizzle-orm/pg-core';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='scrobble-test';
const List=await import('../output/Rocksky.Xrpc.App.Rocksky.Scrobble.GetScrobbles/index.js');
const Detail=await import('../output/Rocksky.Xrpc.App.Rocksky.Scrobble.GetScrobble/index.js');
const Song=await import('../output/Rocksky.Xrpc.App.Rocksky.Song.GetSong/index.js');
const {fromAff}=await import('../output/Control.Promise/index.js');
const {Just,Nothing}=await import('../output/Data.Maybe/index.js');
const run=aff=>fromAff(aff)();const none=Nothing.value;const dialect=new PgDialect();
function mock(responses){const queries=[],projections=[];const db={select(projection){projections.push(projection);let table;const q={from(t){table=getTableName(t);return q},leftJoin(){return q},innerJoin(){return q},where(c){queries.push({table,where:dialect.sqlToQuery(c)});return q},orderBy(...items){queries.push({table,order:items.map(c=>dialect.sqlToQuery(c).sql)});return q},groupBy(){return q},limit(n){queries.push({table,limit:n});return q},offset(n){queries.push({table,offset:n});return q},async execute(){assert.ok(responses[table]?.length,'Unexpected query: '+table);return responses[table].shift()}};return q}};return {db,queries,projections,done(){for(const rows of Object.values(responses))assert.equal(rows.length,0)}};}
const date=new Date('2026-01-01T00:00:00Z'),old=new Date('2025-01-01T00:00:00Z');
const track={id:'t',title:'Song',artist:'A, B, A',uri:'track-uri',albumArt:'art',albumUri:'track-album',mbId:' mbid ',isrc:'  ',sha256:'hash',createdAt:old,updatedAt:old};
const artist=name=>({name,createdAt:old,updatedAt:old});
const row={scrobbles:{id:'s',uri:'scrobble-uri',timestamp:date,createdAt:old,updatedAt:old},tracks:track,users:{handle:'u.test',displayName:null,avatar:null},albums:{uri:'album-uri'},artists:{genres:['jazz']}};
{
 const m=mock({scrobbles:[[row]],loved_tracks:[[{trackId:'t',count:2,liked:true}]]});const result=await run(List.retrieveWithDb({db:m.db})({did:'did:viewer',limit:0}));
 const item=result.scrobbles[0];assert.equal(item.createdAt,date.toISOString());assert.equal(item.updatedAt,old);assert.equal(item.trackUri,'track-uri');assert.equal(item.uri,'scrobble-uri');assert.equal(item.cover,'art');assert.equal(item.albumArt,undefined);assert.equal(item.liked,true);assert.equal(item.likesCount,2);assert.deepEqual(item.tags,['jazz']);
 assert.ok(!('lyrics' in m.projections[0].tracks));assert.ok(m.queries.some(q=>q.limit===20));assert.ok(!m.queries.some(q=>q.table==='scrobbles'&&q.where));m.done();
}
{
 const m=mock({follows:[[]]});assert.deepEqual(await run(List.retrieveWithDb({db:m.db})({did:'did:viewer',following:true})),{scrobbles:[]});m.done();
}
{
 const calls=[];const results=[[{'QUERY PLAN':[{Plan:{'Plan Rows':10}}]}],[{id:'s'}],[]];const db=drizzle({async query(c,p){calls.push({sql:c.text,params:p});return {rows:results.shift()}}});
 assert.deepEqual(await run(List.fetchScrobbles({db})({filter:'artist==Rare',limit:2,offset:7})(new Just(['u']))),[]);
 assert.match(calls[0].sql,/EXPLAIN/);assert.match(calls[1].sql,/WITH matches AS MATERIALIZED/);assert.ok(calls[1].params.includes('Rare'));assert.ok(calls[1].params.includes('u'));assert.deepEqual(calls[1].params.slice(-2),[2,7]);assert.match(calls[2].sql,/order by "scrobbles"\."timestamp" desc, "scrobbles"\."xata_id"/);
 assert.doesNotMatch(calls[2].sql,/lyrics/);
}
{
 const ctx={redis:{async get(k){return k==='scrobbles:ver'?'3':JSON.stringify({scrobbles:[{cached:true}]})}}};assert.deepEqual(await run(List.getScrobbles(ctx)({})),{scrobbles:[{cached:true}]});assert.notEqual(List.cacheKey({following:true,did:'u'})(3),List.cacheKey({following:false,did:'u'})(3));
}
{
 const m=mock({scrobbles:[[row],[{count:4}],[{count:9}],[{handle:'first',avatar:null,timestamp:old}]],artists:[[artist('A')],[artist('B')],[artist('A')]],tracks:[[{id:'t',sha256:'hash'}]],loved_tracks:[[{sha256:'hash',did:'did:viewer'}]]});
 const result=await run(Detail.retrieve({db:m.db})('scrobble-uri')(new Just('did:viewer')));assert.equal(result.listeners,4);assert.equal(result.scrobbles,9);assert.equal(result.albumUri,'album-uri');assert.equal(result.trackUri,'track-uri');assert.equal(result.mbId,'mbid');assert.equal(result.isrc,undefined);assert.equal(result.liked,true);assert.equal(result.firstScrobble.timestamp,old.toISOString());assert.deepEqual(result.artists.map(a=>a.name),['A','B','A']);assert.equal(result.createdAt,old.toISOString());m.done();
}
{
 const m=mock({scrobbles:[[]]});await assert.rejects(run(Detail.retrieve({db:m.db})('missing')(none)),/Scrobble not found/);m.done();
}
{
 await assert.rejects(run(Song.retrieve({})({uri:'  '})(none)),e=>e.message.includes('requires one of'));
 const m=mock({tracks:[[]]});await assert.rejects(run(Song.retrieve({readDb:m.db})({isrc:' missing '})(none)),e=>e.customErrorName==='NotFound');assert.deepEqual(m.queries[0].where.params,['missing']);m.done();
}
{
 const m=mock({user_tracks:[[{trackId:'t'}],[{count:5}]],tracks:[[{tracks:track,artists:{genres:['jazz']}}],[{id:'t',sha256:'hash'}]],artists:[[artist('B'),artist('A')]],loved_tracks:[[{sha256:'hash',did:'did:viewer'}]],scrobbles:[[{count:11}],[]]});
 const result=await run(Song.retrieve({readDb:m.db,db:m.db})({uri:' user-uri ',mbid:' mbid ',isrc:' isrc ',spotifyId:' spotify '})(new Just('did:viewer')));
 assert.equal(result.playCount,11);assert.equal(result.uniqueListeners,5);assert.equal(result.liked,true);assert.equal(result.likesCount,1);assert.equal(result.firstScrobble,undefined);assert.equal(result.createdAt,old.toISOString());assert.deepEqual(result.artists.map(a=>a.name),['A','B','A']);
 const q=m.queries.find(q=>q.table==='tracks'&&q.where).where;assert.deepEqual(q.params,['t','user-uri','mbid','isrc','https://open.spotify.com/track/spotify']);assert.match(q.sql,/ or /);m.done();
}
console.log('Scrobble cache/pagination/presentation and song identifier lookup, artist order, likes, counts and typed errors checks passed');
