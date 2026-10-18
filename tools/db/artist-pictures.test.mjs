import assert from 'node:assert/strict';
import {test} from 'node:test';
import pg from 'pg';
import {parseOptions,retryAfterMs,fetchPictures,selectPictures,savePictures,repairBatch} from './artist-pictures.mjs';
const sha = 'a'.repeat(64), other = 'b'.repeat(64);
const artist = {id:'a',sha256:sha,name:'Artist'};
const picture = 'https://cdn.example/artist.jpg';
const remote = {artists:[{sha256:sha,picture}]};
function session() {return {opts:{apiUrl:'https://api.rocksky.app',delayMs:500},controller:new AbortController(),nextRequestAt:0};}

test('exact hashes, safe picture URLs, and missing-only selection',()=>{
 assert.deepEqual(selectPictures([artist],[{sha256:other,picture},{sha256:sha,picture:null},{sha256:sha,picture:'javascript:bad'}]),[]);
 assert.deepEqual(selectPictures([artist],remote.artists),[{id:'a',sha256:sha,picture}]);
 assert.throws(()=>selectPictures([artist],[{sha256:sha,picture},{sha256:sha,picture:picture+'x'}]),/Ambiguous/);
 assert.equal(parseOptions(['--dry-run','--limit','100'],{XATA_POSTGRES_URL:'postgres://localhost/db'}).limit,100);
 assert.throws(()=>parseOptions(['--batch-size','31'],{}));
});

test('429 Retry-After seconds and HTTP dates are honored; successful requests are paced', async()=>{
 let time=Date.parse('2026-10-18T00:00:00Z'); const waits=[]; let calls=0;
 const s=session();
 const deps={now:()=>time,random:()=>0,sleep:async ms=>{waits.push(ms);time+=ms;},fetch:async url=>{
  assert.equal(url.searchParams.get('filter'),`sha256=in=(${sha})`);
  calls++;
  if(calls===1)return new Response('',{status:429,headers:{'Retry-After':'3'}});
  if(calls===2)return new Response('',{status:429,headers:{'Retry-After':new Date(time+5000).toUTCString()}});
  return Response.json(remote);
 }};
 assert.equal((await fetchPictures(s,[artist],deps)).length,1);
 assert.deepEqual(waits,[3000,5000]);
 await fetchPictures(s,[artist],deps);
 assert.equal(waits.at(-1),500);
 assert.equal(retryAfterMs('bad'),0);
 assert.equal(retryAfterMs('0'),0);
});

test('transient retries are bounded; permanent errors and malformed responses stop immediately',async()=>{
 let calls=0,time=0;
 const deps={now:()=>time,random:()=>0,sleep:async ms=>{time+=ms;},fetch:async()=>{calls++;return new Response('',{status:503});}};
 await assert.rejects(fetchPictures(session(),[artist],deps),/retries exhausted/);
 assert.equal(calls,6);
 calls=0;
 await assert.rejects(fetchPictures(session(),[artist],{...deps,fetch:async()=>{calls++;return new Response('',{status:401});}}),/401/);
 assert.equal(calls,1);
 await assert.rejects(fetchPictures(session(),[artist],{...deps,fetch:async()=>Response.json({})}),/missing artists/);
});

test('network retries and rate-limit reset headers delay subsequent requests',async()=>{
 let time=100000,calls=0;const waits=[];const s=session();
 const deps={now:()=>time,random:()=>0,sleep:async ms=>{waits.push(ms);time+=ms;},fetch:async()=>{
  if(++calls===1)throw Error('connection reset');
  return Response.json(remote,{headers:{'ratelimit-remaining':'0','ratelimit-reset':String((time+4000)/1000)}});
 }};
 await fetchPictures(s,[artist],deps);
 await fetchPictures(s,[artist],deps);
 assert.deepEqual(waits,[1000,4000]);
});

test('dry-run scans without writing or skipping records as pictures are filled',async()=>{
 const s={...session(),cursor:'',upper:'z',opts:{...session().opts,dryRun:true},pool:{query:async(sql,params)=>{
  assert.match(sql,/xata_id > \$1/);assert.equal(params[0],'');return {rows:[artist]};
 }}};
 const original=globalThis.fetch;
 try {globalThis.fetch=async()=>Response.json(remote);
  assert.deepEqual(await repairBatch(s,1),{scanned:1,matched:1,updated:0});assert.equal(s.cursor,'a');
 }finally{globalThis.fetch=original;}
});

test('Postgres repair preserves existing and concurrently filled pictures and is idempotent',
 {skip:!process.env.ARTIST_PICTURE_TEST_URL},async()=>{
 const url=new URL(process.env.ARTIST_PICTURE_TEST_URL);assert.ok(['localhost','127.0.0.1'].includes(url.hostname));
 const client=new pg.Client({connectionString:url.href});await client.connect();
 try {
  await client.query('CREATE TEMP TABLE artists (xata_id text PRIMARY KEY, sha256 text, picture text)');
  await client.query('INSERT INTO artists VALUES ($1,$2,NULL),($3,$2,$4),($5,$2,$6)', ['a',sha,'existing','https://existing.test/a','blank','  ']);
  const pictures=['a','existing','blank'].map(id=>({id,sha256:sha,picture}));
  assert.equal(await savePictures(client,pictures),2);
  assert.equal(await savePictures(client,pictures),0);
  assert.equal((await client.query("SELECT picture FROM artists WHERE xata_id='existing'")).rows[0].picture,'https://existing.test/a');
  await client.query("UPDATE artists SET picture=NULL WHERE xata_id='a'");
  assert.equal(await savePictures(client,[{id:'a',sha256:other,picture}]),0);
 }finally{await client.end();}
});
