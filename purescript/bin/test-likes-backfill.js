import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {getTableName} from 'drizzle-orm';
import {PgDialect} from 'drizzle-orm/pg-core';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='likes-test';
const B=await import('../output/Rocksky.Scripts.BackfillLikes/index.js');const {fromAff,toAffE}=await import('../output/Control.Promise/index.js');const {Just,Nothing}=await import('../output/Data.Maybe/index.js');const run=a=>fromAff(a)();const aff=f=>toAffE(()=>Promise.resolve().then(f));const dialect=new PgDialect();
const song='at://did:plc:test/app.rocksky.song/s';const record=(uri,subject=song)=>({uri,value:{subject:{uri:subject},createdAt:'2020-01-01T00:00:00Z'}});
function mock(responses,insertion){const queries=[],inserts=[];const db={select(){let table;const q={from(t){table=getTableName(t);return q},where(c){queries.push({table,...dialect.sqlToQuery(c)});return q},limit(){return q},async execute(){assert.ok(responses[table]?.length,'unexpected select '+table);return responses[table].shift()}};return q},insert(t){const q={values(v){inserts.push(v);return q},onConflictDoNothing(){return q},returning(){return q},async execute(){return insertion.shift()}};return q}};return {db,queries,inserts};}
{
 const m=mock({loved_tracks:[[{id:'existing'}],[],[],[{id:'duplicate'}],[],[],[],[]]},[[],[{id:'new-id',createdAt:new Date('2020-01-01T00:00:00Z')}]]);const published=[],pages=[],resolved=[];const batches=[{records:[record('ignored','at://did/app.rocksky.album/a'),record('existing'),record('missing'),record('duplicate')],cursor:'next'},{records:[record('conflict'),record('created')],cursor:null}];
 const agent={com:{atproto:{repo:{async listRecords(params){pages.push(params);return {data:batches.shift()}}}}}};const ctx={db:m.db,nc:{publish(subject,bytes){published.push({subject,body:JSON.parse(new TextDecoder().decode(bytes))})}}};
 const out=await run(B.rebuild(ctx)(agent)('did:plc:test')('user')(uri=>aff(()=>{resolved.push(uri);return resolved.length===1?Nothing.value:new Just('track')})));assert.deepEqual(out,{created:1,skipped:3,unresolved:1});assert.equal(pages[1].cursor,'next');assert.equal(pages[0].limit,100);assert.equal(resolved.length,4);assert.equal(m.inserts.length,2);assert.deepEqual(published,[{subject:'rocksky.like',body:{uri:'created',user_id:{xata_id:'user'},track_id:{xata_id:'track'},xata_createdat:'2020-01-01T00:00:00.000Z',xata_updatedat:'2020-01-01T00:00:00.000Z',xata_id:'new-id',xata_version:0}}]);assert.equal(m.inserts[0][0].createdAt.toISOString(),'2020-01-01T00:00:00.000Z');
}
for(const [responses,expected,hashCalls] of [[{tracks:[[{id:'direct'}]]},'direct',0],[{tracks:[[]],user_tracks:[[{id:'user-track'}]]},'user-track',0],[{tracks:[[],[{id:'hashed'}]],user_tracks:[[]]},'hashed',1]]){
 const m=mock(responses,[]);let count=0;const result=await run(B.resolveTrackId({db:m.db})(uri=>aff(()=>{count++;assert.equal(uri,song);return new Just('hash')}))(song));assert.equal(result.value0,expected);assert.equal(count,hashCalls);if(hashCalls)assert.deepEqual(m.queries.at(-1).params,['hash']);
}
{
 let resolved=0;const ctx={baseIdResolver:{did:{async resolveAtprotoData(){resolved++;throw new Error('offline')}}}};const hash=B.cachedSongHash(ctx)();assert.equal(await run(hash(song)),Nothing.value);assert.equal(await run(hash(song)),Nothing.value);assert.equal(resolved,1,'failed fetch remains cached');assert.equal(await run(hash('invalid')),Nothing.value);
}
assert.equal(B.splitAtUri('at://repo/collection/key/ignored').value0.rkey,'key');assert.equal(B.splitAtUri('repo/collection/key').value0.repo,'repo');assert.equal(B.splitAtUri('at://repo//key'),Nothing.value);
console.log('Likes backfill: URI/user-track deduplication, conflict handling, pagination, precise NATS payload, resolution precedence and cached failures passed');
