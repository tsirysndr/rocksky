import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {getTableName} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/node-postgres';
import {PgDialect} from 'drizzle-orm/pg-core';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='song-test';
const Songs=await import('../output/Rocksky.Xrpc.App.Rocksky.Song.GetSongs/index.js');
const {fromAff}=await import('../output/Control.Promise/index.js');const run=aff=>fromAff(aff)();const dialect=new PgDialect();
const date=new Date('2026-01-01T00:00:00Z');const track=id=>({id,title:id,artist:'Artist',album:'Album',createdAt:date,mbId:'mbid',isrc:'isrc'});
function mock(responses){const queries=[];const db={select(){let table;const q={from(t){table=getTableName(t);return q},innerJoin(){return q},where(c){queries.push({table,where:dialect.sqlToQuery(c)});return q},groupBy(){return q},orderBy(...items){queries.push({table,order:items.map(c=>dialect.sqlToQuery(c).sql)});return q},limit(n){queries.push({table,limit:n});return q},offset(n){queries.push({table,offset:n});return q},async execute(){assert.ok(responses[table]?.length,'unexpected '+table);return responses[table].shift()}};return q}};return {db,queries,done(){for(const rows of Object.values(responses))assert.equal(rows.length,0)}};}
{
 const m=mock({tracks:[[track('t')]]});const result=await run(Songs.retrieveSongs(m.db)({mbid:' mbid ',isrc:' isrc ',spotifyId:' spotify ',filter:'duration=gt=100',genre:'ignored',limit:0,offset:2}));
 assert.equal(result[0].playCount,0);assert.equal(result[0].uniqueListeners,0);assert.equal(result[0].mbid,'mbid');assert.equal(result[0].mbId,undefined);assert.equal(result[0].createdAt,date.toISOString());
 const q=m.queries[0].where;assert.deepEqual(q.params,['mbid','isrc','https://open.spotify.com/track/spotify',100]);assert.match(q.sql,/ or /);assert.match(q.sql,/ and /);assert.ok(m.queries.some(q=>q.limit===0));m.done();
}
{
 const m=mock({scrobbles:[[{trackId:'b',play_count:'7',unique_listeners:'3'},{trackId:null,play_count:10,unique_listeners:4},{trackId:'a',play_count:'4',unique_listeners:'2'}]],tracks:[[track('a'),track('b')]]});
 const result=await run(Songs.retrieveSongs(m.db)({genre:'jazz',limit:5,offset:3}));assert.deepEqual(result.map(t=>[t.id,t.playCount,t.uniqueListeners]),[['b',7,3],['a',4,2]]);assert.equal(result[0].mbid,undefined);
 const q=m.queries.find(q=>q.where).where;assert.match(q.sql,/EXISTS.*album_artist.*@>/);assert.deepEqual(q.params,['jazz']);assert.ok(m.queries.some(q=>q.offset===3));m.done();
}
{
 const m=mock({scrobbles:[[]]});assert.deepEqual(await run(Songs.retrieveSongs(m.db)({})),[]);m.done();
}
{
 const calls=[],responses=[[{'QUERY PLAN':[{Plan:{'Plan Rows':2}}]}],[{id:'a'},{id:'b'}],[],[['b','B','Artist','Artist',null,'Album',null,null,null,'hash',1,1,1000,null,'2026-01-01 00:00:00'],['a','A','Artist','Artist',null,'Album',null,null,null,'hash',1,1,1000,null,'2026-01-01 00:00:00']]];
 const db=drizzle({async query(c,p){calls.push({sql:c.text,params:p});assert.ok(responses.length);return {rows:responses.shift()}}});
 const result=await run(Songs.retrieveSongs(db)({filter:'title==*',genre:'jazz',limit:2,offset:10}));assert.deepEqual(result.map(t=>t.id),['a','b']);assert.ok(result.every(t=>t.playCount===0));
 assert.match(calls[0].sql,/EXPLAIN/);assert.match(calls[1].sql,/MATERIALIZED/);assert.deepEqual(calls[1].params.slice(-2),[2,10]);assert.ok(!calls[2].params.includes(10));assert.match(calls[2].sql,/count\(distinct/);assert.equal(responses.length,0);
}
console.log('Song catalog direct-ID filters, genre rankings, selective pagination, zero-play hydration and output field checks passed');
