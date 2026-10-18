import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PgDialect} from 'drizzle-orm/pg-core';
import {S3Client} from '@aws-sdk/client-s3';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='analysis-test';process.env.S3_ENDPOINT='https://storage.invalid';
const B=await import('../output/Rocksky.Scripts.BackfillAnalysis/index.js');const N=await import('../output/Rocksky.Analysis/index.js');const {fromAff,toAffE}=await import('../output/Control.Promise/index.js');const {Just,Nothing}=await import('../output/Data.Maybe/index.js');const run=a=>fromAff(a)();const aff=f=>toAffE(()=>Promise.resolve().then(f));const dialect=new PgDialect();
const row=(uploadId,trackId=uploadId)=>({uploadId,trackId,r2Key:uploadId,mimeType:'audio/wav',userId:'u',storageProviderId:null,title:trackId,artist:'Artist'});
function mock(total,pages){const queries=[];let count=true;const db={select(){let isCount=count;count=false;const q={from(){return q},innerJoin(){return q},where(c){queries.push({isCount,...dialect.sqlToQuery(c)});return q},orderBy(){return q},limit(n){assert.equal(n,8);return q},async execute(){if(isCount)return [{total}];assert.ok(pages.length,'unexpected page');return pages.shift()}};return q}};return {db,queries,pages};}
const opts={batchSize:2,limit:Infinity,userId:new Just('u'),dryRun:false,onlyFingerprint:false};
{
 const m=mock(4,[[row('01','a'),row('02','a'),row('03','b'),row('04','c'),row('05','d')],[row('04','c'),row('05','d'),row('06','e')],[row('06','e')]]);const downloaded=[],stored=[],batches=[];
 const ops={download:r=>aff(()=>{downloaded.push(r.uploadId);if(r.trackId==='b')throw new Error('failed download');return Buffer.from(r.trackId)}),analyze:items=>progress=>aff(()=>{batches.push(items.map(i=>i.id));assert.ok(items.every(i=>i.extensionHint==='wav'));items.forEach((i,index)=>progress({id:i.id,completed:index+1,ok:true,key:'Fm',bpm:120,fingerprint:true})());return items.map(i=>({id:i.id,ok:i.id!=='d',analysis:i.id==='d'?null:{key:'Fm',bpm:120,fingerprint:'fp'}}))}),store:id=>a=>aff(()=>stored.push(id))};
 const out=await run(B.backfill({db:m.db})(opts)(ops));assert.deepEqual(out,{processed:4,filled:3,failed:1,downloadFailed:1});assert.deepEqual(downloaded,['01','03','04','05','06']);assert.deepEqual(stored,['a','c','e']);assert.deepEqual(batches,[['a'],['c','d'],['e']]);assert.deepEqual(m.queries.slice(1).map(q=>q.params[0]),['','03','05']);assert.match(m.queries[0].sql,/"key" is null.* or .*"bpm" is null.* or .*acoustid_fingerprint/);assert.deepEqual(m.queries[0].params,['u']);
}
{
 const m=mock(1,[[row('01')]]);let wrote=false;const out=await run(B.backfill({db:m.db})({...opts,onlyFingerprint:true,dryRun:true})({download:r=>aff(()=>Buffer.from('x')),analyze:items=>p=>aff(()=>[{id:'01',ok:true,analysis:{key:null,bpm:null,fingerprint:'fp'}}]),store:id=>a=>aff(()=>{wrote=true})}));assert.equal(out.filled,1);assert.equal(wrote,false);assert.doesNotMatch(m.queries[0].sql,/"bpm"/);
}
{
 const m=mock(1,[[row('01')]]);const native={async analyzeBatch(){return [{id:'01',ok:true,analysis:{key:'Am',bpm:100}}]}};
 const analyze=items=>p=>N.analyzeBatch(native)(items)(p);const output=await run(analyze([])(()=>()=>{}));assert.equal(N.supportsFingerprint(output[0].analysis),false,'FFI must preserve absent fingerprint');
 await assert.rejects(run(B.backfill({db:m.db})(opts)({download:r=>aff(()=>Buffer.from('x')),analyze,store:id=>a=>aff(()=>{throw new Error('must not store')})})),/built without fingerprint support/);
}
{
 const original=S3Client.prototype.send,clients=[],signals=[];S3Client.prototype.send=async function(command,{abortSignal}){clients.push(this);signals.push(abortSignal);return {Body:{transformToByteArray(){if(command.input.Key==='stall')return new Promise((resolve,reject)=>abortSignal.addEventListener('abort',()=>reject(new Error('aborted body')),{once:true}));return Promise.resolve(Buffer.from('audio'))}}}};
 try{const download=B.cachedDownload({})(30)();const buffers=await Promise.all([run(download(row('one'))),run(download({...row('two'),userId:'another'}))]);assert.equal(buffers[0].toString(),'audio');assert.equal(clients[0],clients[1],'managed storage shares client across users');await assert.rejects(run(download(row('stall'))),/aborted body/);assert.equal(signals[2].aborted,true);await new Promise(r=>setTimeout(r,40));assert.equal(signals[0].aborted,false,'completed operation clears timeout');}finally{S3Client.prototype.send=original;for(const c of new Set(clients))c.destroy()}
}
console.log('Analysis backfill: duplicate tracks, consumed cursor, download failures, batch target, dry-run, native compatibility, shared clients and body-read aborts passed');
