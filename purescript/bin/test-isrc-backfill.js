import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PgDialect} from 'drizzle-orm/pg-core';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='identifier-test';
const B=await import('../output/Rocksky.Scripts.BackfillIsrcMbid/index.js');
const {fromAff,toAffE}=await import('../output/Control.Promise/index.js');
const run=a=>fromAff(a)();const aff=f=>toAffE(()=>Promise.resolve().then(f));const dialect=new PgDialect();
const opts={pageSize:3,concurrency:2,delayMs:1100,limit:Infinity,fillMb:true,fillIsrc:true,artist:'Artist',album:'Album'};
const row=id=>({id,title:id,artist:'Artist',album:'Album',mbId:null,isrc:null});
const candidate=(mb,isrc)=>({identifiers:{musicbrainzRecordingId:mb,isrc}});
const where=dialect.sqlToQuery(B.buildWhere(opts));assert.match(where.sql,/is null.*or.*is null/);assert.deepEqual(where.params,['%Artist%','%Album%']);
let writes=[],pauses=0;
const db={update(){const q={set(value){writes.push(value);return q},where(){return q},async execute(){}};return q}};
const pause=aff(()=>{pauses++});
assert.deepEqual(await run(B.processTrackRow({db})(opts)(()=>aff(()=>candidate('mb','isrc')))(pause)({...row('a'),mbId:'existing'})),{mb:false,isrc:true});assert.deepEqual(writes,[{isrc:'isrc'}]);assert.equal(pauses,1);
assert.deepEqual(await run(B.processTrackRow({db})(opts)(()=>aff(()=>null))(pause)(row('b'))),{mb:false,isrc:false});assert.equal(pauses,2);assert.equal(writes.length,1);
await assert.rejects(run(B.processTrackRow({db})(opts)(()=>aff(()=>{throw Error('matching unavailable')}))(pause)(row('c'))),/matching unavailable/);assert.equal(pauses,2);
const badDb={update(){const q={set(){return q},where(){return q},async execute(){throw Object.assign(Error('write failed'),{cause:{code:'23514',constraint:'check',detail:'bad'}})}};return q}};
assert.deepEqual(await run(B.processTrackRow({db:badDb})(opts)(()=>aff(()=>candidate('mb','isrc')))(pause)(row('d'))),{mb:false,isrc:false});
{
 const pages=[[row('a'),row('b'),row('c')],[row('d'),row('e')],[]],offsets=[],limits=[];let first=true;
 const mock={...db,select(){const count=first;first=false;const q={from(){return q},where(){return q},orderBy(){return q},offset(n){offsets.push(n);return q},limit(n){limits.push(n);return q},async execute(){return count?[{n:5}]:pages.shift()}};return q}};
 let active=0,max=0;
 const match=r=>aff(async()=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,2));active--;if(r.id==='c')throw Error('isolated');return r.id==='a'?candidate('mb','isrc'):null});
 const result=await run(B.backfill({db:mock})(opts)(match)(pause));assert.deepEqual({...result,startedAt:0},{processed:5,mb:1,isrc:1,failed:4,totalTarget:5,startedAt:0});assert.deepEqual(offsets,[0,1,1]);assert.deepEqual(limits,[3,3,3]);assert.equal(max,2);
}
await assert.rejects(run(B.backfill({db})( {...opts,fillMb:false,fillIsrc:false})(()=>aff(()=>null))(pause)),/nothing to do/);
console.log('Identifier backfill: selected fields, matching delay, isolated failures, bounded concurrency, scopes and cumulative pagination passed');
