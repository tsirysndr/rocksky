import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PgDialect} from 'drizzle-orm/pg-core';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='replaygain-test';
const B=await import('../output/Rocksky.Scripts.BackfillReplaygain/index.js');const {fromAff,toAffE}=await import('../output/Control.Promise/index.js');const {Just,Nothing}=await import('../output/Data.Maybe/index.js');const run=a=>fromAff(a)();const aff=f=>toAffE(()=>Promise.resolve().then(f));const dialect=new PgDialect();
function mock(batches){const queries=[],updates=[];const db={select(){const q={from(){return q},where(c){queries.push(dialect.sqlToQuery(c));return q},orderBy(){return q},limit(n){assert.equal(n,100);return q},async execute(){assert.ok(batches.length);return batches.shift()}};return q},update(){let values;const q={set(v){values=v;return q},where(c){updates.push({values,...dialect.sqlToQuery(c)});return q},async execute(){}};return q}};return {db,queries,updates};}
const row=(id,mimeType='audio/mpeg')=>({id,r2Key:id,mimeType});
{
 const m=mock([[row('unsupported','video/mp4'),row('already'),row('unchanged'),row('failed'),row('good'),row('not-reached')]]);const calls=[];const buffers=new Map();const ops={download:key=>aff(()=>{calls.push(['download',key]);if(key==='failed')throw new Error('download failure');const b=Buffer.from(key);buffers.set(key,b);return b}),hasGain:buf=>mime=>aff(()=>buf.toString()==='already'),tag:buf=>ext=>aff(()=>{calls.push(['tag',buf.toString(),ext]);return buf.toString()==='unchanged'?buf:Buffer.from('tagged')}),upload:r=>buf=>aff(()=>calls.push(['upload',r.id,buf.length]))};
 const result=await run(B.backfill({db:m.db})({pageSize:100,limit:1,userId:new Just('user'),dryRun:false})(ops));assert.deepEqual(result,{scanned:5,tagged:1,skipped:2,failed:2});assert.deepEqual(m.queries[0].params,['user','']);assert.match(m.queries[0].sql,/storage_provider_id.*is null/);assert.equal(calls.some(c=>c[1]==='not-reached'),false);assert.deepEqual(m.updates.map(u=>[u.values.fileSize,u.params]),[[6,['good']]]);assert.equal(calls.filter(c=>c[0]==='upload').length,1);
}
{
 const m=mock([[row('a'),row('b')],[]]);const ops={download:key=>aff(()=>Buffer.from(key)),hasGain:buf=>mime=>aff(()=>false),tag:()=>{throw new Error('dry run tagged')},upload:()=>{throw new Error('dry run uploaded')}};
 const result=await run(B.backfill({db:m.db})({pageSize:100,limit:Infinity,userId:Nothing.value,dryRun:true})(ops));assert.deepEqual(result,{scanned:2,tagged:2,skipped:0,failed:0});assert.deepEqual(m.queries[1].params,['b']);assert.deepEqual(m.updates,[]);
}
console.log('ReplayGain backfill: managed/user filtering, keyset cursor, successful-tag limit, existing tags, unchanged-buffer failure, download recovery, size updates and dry-run no-writes passed');
