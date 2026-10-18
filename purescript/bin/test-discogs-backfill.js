import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PgDialect} from 'drizzle-orm/pg-core';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='discogs-backfill-test';
const B=await import('../output/Rocksky.Scripts.BackfillDiscogs/index.js');const D=await import('../output/Rocksky.Lib.DiscogsEnrichment/index.js');const {fromAff,toAffE}=await import('../output/Control.Promise/index.js');const {Just}=await import('../output/Data.Maybe/index.js');const {Left,Right}=await import('../output/Data.Either/index.js');const run=a=>fromAff(a)();const aff=f=>toAffE(()=>Promise.resolve().then(f));const dialect=new PgDialect();
for(const value of ['','-1','1.2','1e3',' 1','9007199254740992'])assert.ok(B.parseOffset(value) instanceof Left,value);for(const value of ['0','0002','2147483648','9007199254740991']){const out=B.parseOffset(value);assert.ok(out instanceof Right);assert.equal(out.value0,Number(value))}
const query=dialect.sqlToQuery(B.pendingAfter(new Just('id')));assert.match(query.sql,/\("albums"\."xata_createdat", "albums"\."xata_id"\) >/);assert.match(query.sql,/SELECT xata_createdat, xata_id FROM albums/);assert.deepEqual(query.params,['id']);
const row=id=>({id,artist:'Artist',title:id});
function mock(pending,pages){const queries=[],offsets=[];let count=true;const db={select(){let isCount=count;count=false;const q={from(){return q},where(c){queries.push(dialect.sqlToQuery(c));return q},orderBy(...order){assert.equal(order.length,2);return q},limit(n){assert.equal(n,200);return q},offset(n){offsets.push(n);return q},async execute(){if(isCount)return [{count:pending}];assert.ok(pages.length);return pages.shift()}};return q}};return {db,queries,offsets};}
{
 const m=mock(7,[[row('a'),row('b')],[row('c'),row('d'),row('beyond')]]);const calls=[],pauses=[];const responses={a:[D.Unavailable.value,D.Unavailable.value,new D.Matched({discogsId:123})],b:[D.Missed.value],c:[D.Skipped.value],d:[D.Unavailable.value,D.Unavailable.value,D.Unavailable.value]};
 const out=await run(B.backfill({db:m.db})({offset:2,perMinute:20,limit:4,dryRun:false})(album=>aff(()=>{calls.push(album.id);assert.ok(responses[album.id]?.length);return responses[album.id].shift()}))(ms=>aff(()=>pauses.push(ms))));assert.deepEqual(out,{processed:4,matched:1,missed:1,skipped:1,failed:1});assert.deepEqual(m.offsets,[2,0]);assert.deepEqual(m.queries[2].params,['b']);assert.deepEqual(calls,['a','a','a','b','c','d','d','d']);assert.deepEqual(pauses,[60000,60000,3000,3000,3000,60000,60000,3000]);
}
{
 const m=mock(2,[[row('a'),row('b')]]);const out=await run(B.backfill({db:m.db})({offset:0,perMinute:18,limit:Infinity,dryRun:true})(()=>{throw new Error('dry run enriched')})(()=>{throw new Error('dry run waited')}));assert.deepEqual(out,{processed:2,matched:0,missed:0,skipped:0,failed:0});
}
{
 const m=mock(2,[]);const out=await run(B.backfill({db:m.db})({offset:3,perMinute:18,limit:Infinity,dryRun:false})(()=>{throw new Error('unexpected enrichment')})(()=>{throw new Error('unexpected wait')}));assert.equal(out.processed,0);assert.equal(m.offsets.length,0);
}
console.log('Discogs backfill: safe offset validation, database-precision keyset, one-time offset, unavailable cooldown/retry limits, pacing, counters and dry-run passed');
