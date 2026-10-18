import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='scrobble-test';
const Create=await import('../output/Rocksky.Xrpc.App.Rocksky.Scrobble.CreateScrobble/index.js');
const Guard=await import('../output/Rocksky.Lib.ScrobbleGuard/index.js');
const Durable=await import('../output/Rocksky.Lib.DurableSubmission/index.js');
const {fromAff,toAffE}=await import('../output/Control.Promise/index.js');
const Xrpc=await import('../output/Atproto.XrpcServer/index.js');
const run=aff=>fromAff(aff)();
const track={title:' Song ',artist:'Artist',album:'Album',albumArtist:'Artist',duration:180000,timestamp:1700000000};
function setup({guardError,agent=true,queueError}={}){
 const calls=[];const deps={guard:did=>toAffE(async()=>{calls.push(['guard',did]);if(guardError)throw guardError}),agentAvailable:did=>toAffE(async()=>{calls.push(['agent',did]);return agent}),enqueue:did=>track=>key=>skip=>toAffE(async()=>{calls.push(['enqueue',did,track,key,skip]);if(queueError)throw queueError;return 'id'})};
 const invoke=(body=track,headers={},did='did:plc:u')=>run(Create.handlerWith(deps)({input:{body},params:{},auth:did?{credentials:{did}}:null,req:{headers}}));return {calls,invoke};
}
{
 const m=setup();const result=await m.invoke({}, {},null);assert.ok(result instanceof Xrpc.Failure);assert.equal(result.value0,400);assert.equal(m.calls.length,0);
}
{
 const m=setup();const result=await m.invoke({title:'x'});assert.equal(result.value0,400);assert.match(result.value1,/albumArtist/);assert.match(result.value1,/duration/);assert.equal(m.calls.length,0);
}
for(const guardError of [Guard.toError(new Guard.ScrobbleBotFlagged({did:'did:plc:u'})),Guard.toError(new Guard.ScrobbleBlocked({did:'did:plc:u',retryAfter:90}))]){
 const m=setup({guardError});const result=await m.invoke();assert.equal(result.value0,429);assert.equal(m.calls.length,1);assert.ok(result.value1.length>100);
}
{
 const m=setup({agent:false});assert.equal((await m.invoke()).value0,401);assert.deepEqual(m.calls.map(c=>c[0]),['guard','agent']);
}
for(const key of ['x'.repeat(513),['one','two']]){
 const m=setup();assert.equal((await m.invoke(track,{'idempotency-key':key})).value0,400);assert.equal(m.calls.length,2);
}
{
 const m=setup();const result=await m.invoke(track,{'idempotency-key':'explicit','x-rocksky-mirror-provider':'tealfm'});assert.ok(result instanceof Xrpc.Json);assert.deepEqual(result.value0,{});assert.equal(m.calls[2][2].title,'Song');assert.equal(m.calls[2][3].value0,'explicit');assert.equal(m.calls[2][4],true);
}
{
 const m=setup({queueError:Durable.submissionUnavailable('queue offline')});const result=await m.invoke();assert.equal(result.value0,503);assert.equal(result.value1,'queue offline');
}
{
 const m=setup({guardError:Error('private details')});const result=await m.invoke();assert.equal(result.value0,500);assert.equal(result.value1,'Internal error while creating scrobble.');assert.equal(m.calls.length,1);
}
console.log('Scrobble submission validation, guard ordering, session expiry, idempotency, durable acceptance and error mapping checks passed');
