import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='recommendation-test';
const C=await import('../output/Rocksky.Lib.ResultCache/index.js');const R=await import('../output/Rocksky.Xrpc.App.Rocksky.Feed.RecommendationCommon/index.js');const {fromAff,toAffE}=await import('../output/Control.Promise/index.js');const {Just,Nothing}=await import('../output/Data.Maybe/index.js');const run=a=>fromAff(a)();const aff=f=>toAffE(()=>Promise.resolve().then(f));
{
 let now=0,calls=[];const cache=C.createWithClock(()=>now)(10)(2)(key=>aff(()=>{calls.push(key);return key+calls.length}))();
 assert.equal(await run(cache('a')),'a1');now=10;assert.equal(await run(cache('a')),'a1');now=11;assert.equal(await run(cache('a')),'a2');await run(cache('b'));await run(cache('a'));await run(cache('c'));await run(cache('b'));assert.deepEqual(calls,['a','a','b','c','b']);
}
{
 let now=0,count=0,release;const gate=new Promise(r=>release=r);const cache=C.createWithClock(()=>now)(10)(2)(()=>aff(async()=>{count++;await gate;return 'shared'}))();const a=run(cache('a')),b=run(cache('a'));await new Promise(r=>setTimeout(r,1));assert.equal(count,1);now=100;release();assert.deepEqual(await Promise.all([a,b]),['shared','shared']);now=110;await run(cache('a'));assert.equal(count,1);now=111;await run(cache('a'));assert.equal(count,2);
}
{
 let now=0,count=0;const cache=C.createWithClock(()=>now)(10)(2)(()=>aff(()=>{count++;throw Error('stored failure')}))();await Promise.all([assert.rejects(run(cache('x')),/stored failure/),assert.rejects(run(cache('x')),/stored failure/)]);assert.equal(count,1);await assert.rejects(run(cache('x')));assert.equal(count,1);now=11;await assert.rejects(run(cache('x')));assert.equal(count,2);
}
{
 const Aff=await import('../output/Effect.Aff/index.js');let calls=0;
 const cache=C.createWithClock(()=>0)(10)(2)(()=>{calls++;return calls===1?Aff.delay(100000):aff(()=> 'recovered')})();
 const leader=await run(Aff.forkAff(cache('cancel')));const follower=run(cache('cancel'));const rejected=assert.rejects(follower,/cancelled/);
 await run(Aff.killFiber(new Error('cancelled'))(leader));await rejected;
 assert.equal(await run(cache('cancel')),'recovered');assert.equal(calls,2);
}
assert.equal(R.cacheKey({did:'did|extra',limit:null}),'did|extra|50');assert.deepEqual(R.decodeKey('did|extra|50'),{did:'did|extra',limit:50});assert.notEqual(R.cacheKey({did:'did',limit:101}),R.cacheKey({did:'did',limit:102}));
const originalFetch=globalThis.fetch,originalDrift=process.env.DRIFT_URL;
try{
 let requests=[],legacyCalls=0;const legacy=p=>aff(()=>{legacyCalls++;return {artists:[p.did]}});globalThis.fetch=async(url,opts)=>{requests.push(url);assert.ok(opts.signal);return new Response(JSON.stringify({artists:['drift']}))};
 assert.deepEqual(await run(R.lookupWith(new Just('https://drift.test/base'))('/v1/recommendations/artists')(legacy)({did:'a b',limit:150})),{artists:['drift']});assert.equal(requests[0],'https://drift.test/v1/recommendations/artists?did=a+b&limit=100');assert.equal(legacyCalls,0);
 globalThis.fetch=async()=>new Response(null,{status:503});assert.deepEqual(await run(R.lookupWith(new Just('https://drift.test'))('/v1/recommendations/artists')(legacy)({did:'fallback',limit:5})),{artists:['fallback']});assert.equal(legacyCalls,1);
 process.env.DRIFT_URL='';let failCalls=0;const cached=R.cached('test')('/v1/recommendations/artists')({artists:[]})(()=>aff(()=>{failCalls++;throw Error('permanent')}))();assert.deepEqual(await run(cached({did:'x',limit:null})),{artists:[]});assert.deepEqual(await run(cached({did:'x',limit:50})),{artists:[]});assert.equal(failCalls,1);
}finally{globalThis.fetch=originalFetch;if(originalDrift===undefined)delete process.env.DRIFT_URL;else process.env.DRIFT_URL=originalDrift}
console.log('Recommendation shared pipeline: LRU, shared lookup, failure retention, completion TTL, normalized keys, Drift URL/limit and fallback passed');
