import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PgDialect} from 'drizzle-orm/pg-core';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='uri-test';
const B=await import('../output/Rocksky.Scripts.BackfillTrackUri/index.js');const Map=await import('../output/Data.Map/index.js');const Ref=await import('../output/Effect.Ref/index.js');const {ordString}=await import('../output/Data.Ord/index.js');const {fromAff,toAffE}=await import('../output/Control.Promise/index.js');const run=a=>fromAff(a)();const aff=f=>toAffE(()=>Promise.resolve().then(f));const dialect=new PgDialect();const hash=s=>createHash('sha256').update(s).digest('hex');
{
 const h=hash('title - artist - '),wanted=Map.insert(ordString)(h)('track')(Map.empty),found=Ref.new([])(),calls=[];const pages=[{records:[{uri:'first',value:{title:'TITLE',artist:'Artist'}},{uri:'duplicate',value:{title:'Title',artist:'ARTIST',album:''}},{uri:'ignore',value:{title:'Other',artist:'Artist'}}],cursor:'next'},{records:[],cursor:'must-stop'}];const agent={com:{atproto:{repo:{async listRecords(p){calls.push(p);return {data:pages.shift()}}}}}};
 const hits=await run(B.collectWithAgent(agent)('did:test')(wanted)(found));assert.equal(hits,1);assert.deepEqual(Ref.read(found)(),[{hash:h,uri:'first'}]);assert.equal(calls.length,2);assert.equal(calls[1].cursor,'next');
}
{
 const queries=[],db={async execute(q){const compiled=dialect.sqlToQuery(q);queries.push(compiled);return {rows:[{n:2}],rowCount:3}}};assert.equal(await run(B.backfillFromUserTracks(db)(true)),2);assert.match(queries[0].sql,/SELECT count/);assert.equal(await run(B.backfillFromUserTracks(db)(false)),3);assert.match(queries[1].sql,/UPDATE tracks/);assert.match(queries[1].sql,/NOT EXISTS/);assert.match(queries[1].sql,/app.rocksky.song/);
 queries.length=0;assert.equal(await run(B.applyFound(db)(true)([{hash:'h',uri:'u'}])),1);assert.equal(queries.length,0);assert.equal(await run(B.applyFound(db)(false)([{hash:'h',uri:'u'}])),3);assert.deepEqual(queries[0].params,['u','h','u']);assert.match(queries[0].sql,/uri IS NULL/);
}
{
 let active=0,max=0;const completed=[];await run(B.mapWithConcurrency([0,1,2,3,4])(2)(item=>index=>toAffE(async()=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--;completed.push(index);if(item===1)throw new Error('worker failure')})));assert.equal(max,2);assert.deepEqual(completed.sort(),[0,1,2,3,4]);let calls=0;await run(B.mapWithConcurrency([1,2])(0)(x=>i=>aff(()=>{calls++})));assert.equal(calls,0);
}
{
 let select=0;const sql=[],db={select(){const index=select++;const q={from(){return q},where(){return q},async execute(){return index===0?[{n:5}]:[{id:'track',sha256:'hash'}]}};return q},async execute(q){const compiled=dialect.sqlToQuery(q);sql.push(compiled.sql);return compiled.sql.startsWith('SELECT count')?{rows:[{n:1}]}:{rows:[{did:'did:one'},{did:'did:two'}]}}};const crawled=[];
 await run(B.backfill(db)({dryRun:true,allUsers:false,concurrency:2})(did=>wanted=>found=>aff(()=>{crawled.push(did);assert.equal(Map.lookup(ordString)('hash')(wanted).value0,'track');Ref.modify_(rows=>rows.length?rows:[{hash:'hash',uri:'song'}])(found)()})));assert.deepEqual(crawled.sort(),['did:one','did:two']);assert.ok(sql.every(q=>!q.startsWith('UPDATE')));assert.match(sql[1],/scrobbles/);assert.match(sql[1],/user_tracks/);
}
console.log('Track URI backfill: two-pass guarded SQL, hash matching, first URI wins, empty-page stop, bounded workers/recovery, zero concurrency and dry-run passed');
