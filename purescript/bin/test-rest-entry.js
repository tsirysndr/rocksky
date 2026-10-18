import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Hono} from 'hono';
import {PgDialect} from 'drizzle-orm/pg-core';
import jwt from 'jsonwebtoken';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='rest-entry-test';process.env.JWT_SECRET='entry-secret';
const R=await import('../output/Rocksky.Rest.Reads/index.js'),M=await import('../output/Rocksky.Rest.Mutations/index.js'),G=await import('../output/Rocksky.Lib.ScrobbleGuard/index.js'),S=await import('../output/Rocksky.Lib.DurableSubmission/index.js');const {toAffE}=await import('../output/Control.Promise/index.js');const {Just,Nothing}=await import('../output/Data.Maybe/index.js');const aff=f=>toAffE(()=>Promise.resolve().then(f));const dialect=new PgDialect(),user={id:'caller',did:'did:plc:caller'},authorization='Bearer '+jwt.sign({did:user.did},process.env.JWT_SECRET);const track={title:' Song ',artist:'Artist',album:'Album',albumArtist:'Artist',duration:100};
function setup(answers=[],options={}){const queries=[],events=[],metrics=[],posts=[],redis=[];const db={select(fields){const call={fields};queries.push(call);const q={from(){return q},innerJoin(){return q},where(w){call.where=dialect.sqlToQuery(w);return q},orderBy(...xs){call.order=xs.map(x=>dialect.sqlToQuery(x).sql);return q},limit(n){call.limit=n;return q},offset(n){call.offset=n;return q},async execute(){events.push('select');assert.ok(answers.length);return answers.shift()}};return q}};const ctx={db,analytics:{async request({url,data}){posts.push({url,data});return {data:{raw:url}}}},redis:{async get(k){redis.push(k);return k.endsWith(':status')?(options.status??null):(options.playing??null)}},metrics:{requestCounter:{add(_n,t){metrics.push(t)}}}};const ops={agent:did=>aff(()=>{events.push('agent:'+did);return options.noAgent?Nothing.value:new Just({})}),guard:did=>aff(()=>{events.push('guard:'+did);if(options.guardError)throw options.guardError}),enqueue:did=>t=>key=>aff(()=>{events.push(['enqueue',did,t,key]);if(options.queueError)throw options.queueError;return 'job-id'}),save:t=>a=>aff(()=>{events.push(['save',t]);if(options.saveError)throw options.saveError}),like:t=>u=>a=>aff(()=>events.push(['like',t,u])),unlike:sha=>u=>a=>aff(()=>events.push(['unlike',sha,u]))};const app=new Hono();app.onError(e=>new Response(String(e),{status:500}));R.register(ctx)(app)();M.registerWith(ctx)(ops)(app)();return {app,queries,events,metrics,posts,redis}}
const request=(m,method,path,body=track,headers={})=>m.app.request(path,{method,headers:{authorization,'content-type':'application/json',...headers},...(method==='POST'?{body:JSON.stringify(body)}:{})});
for(const [method,path] of [['POST','/now-playing'],['POST','/likes'],['DELETE','/likes/hash'],['POST','/tracks'],['GET','/likes'],['GET','/scrobbles']]){const m=setup();assert.equal((await m.app.request(path,{method})).status,401);assert.equal(m.events.length,0);assert.equal(m.metrics.length,1)}
{
 const m=setup([[user]]);const r=await request(m,'POST','/now-playing',track,{'idempotency-key':'key'});assert.deepEqual(await r.json(),{status:'ok'});assert.equal(r.headers.get('X-Submission-Id'),'job-id');assert.deepEqual(m.events.slice(0,3),['select','agent:'+user.did,'guard:'+user.did]);assert.equal(m.events[3][2].title,'Song');assert.equal(m.events[3][3].value0,'key');
 const invalid=setup([[user]]);assert.equal((await request(invalid,'POST','/now-playing',{})).status,400);assert.deepEqual(invalid.events,['select']);
 const noAgent=setup([[user]],{noAgent:true});const expired=await request(noAgent,'POST','/now-playing');assert.equal(expired.status,401);assert.equal((await expired.json()).error,'pds_session_expired');
 const long=setup([[user]]);assert.equal((await request(long,'POST','/now-playing',track,{'idempotency-key':'a'.repeat(513)})).status,400);assert.equal(long.events.length,3);
 for(const [error,status,code,retry] of [[G.toError(new G.ScrobbleBotFlagged({did:user.did})),429,'account_flagged_as_bot',null],[G.toError(new G.ScrobbleBlocked({did:user.did,retryAfter:42})),429,'scrobble_rate_exceeded','42'],[new Error('unexpected'),500,null,null]]){const m=setup([[user]],{guardError:error});const r=await request(m,'POST','/now-playing');assert.equal(r.status,status);if(code)assert.equal((await r.json()).error,code);assert.equal(r.headers.get('retry-after'),retry);assert.equal(m.events.length,3)}
 const unavailable=setup([[user]],{queueError:S.submissionUnavailable('queue unavailable')});const r2=await request(unavailable,'POST','/now-playing');assert.equal(r2.status,503);assert.deepEqual(await r2.json(),{error:'queue unavailable'});
}
{
 const m=setup([[user]]);assert.equal((await request(m,'POST','/likes')).status,200);assert.deepEqual(m.events.slice(0,2),['agent:'+user.did,'select']);assert.equal(m.events[2][0],'like');
 const missing=setup([],{noAgent:true});assert.equal((await request(missing,'DELETE','/likes/hash')).status,401);assert.equal(missing.queries.length,0);
 const del=setup([[user]]);assert.equal((await request(del,'DELETE','/likes/hash')).status,200);assert.deepEqual(del.events[2],['unlike','hash',user]);
 for(const saveError of [undefined,new Error('duplicate key value violates unique constraint'),new Error('other save error')]){const m=setup([[user]],{saveError});assert.equal((await request(m,'POST','/tracks')).status,200);assert.deepEqual(m.events.slice(0,2),['select','agent:'+user.did]);assert.equal(m.events[2][0],'save')}
}
{
 for(const [playing,status,expected] of [[JSON.stringify({title:'x',is_playing:true}),'0',true],[JSON.stringify({is_playing:false}),'1',false],[JSON.stringify({is_playing:'yes'}),'1',true]]){const m=setup([[user]],{playing,status});assert.equal((await (await m.app.request('/now-playing?did=handle')).json()).is_playing,expected);assert.deepEqual(m.queries[0].where.params,['handle','handle']);assert.deepEqual(m.redis,['nowplaying:'+user.did,'nowplaying:'+user.did+':status'])}
 const none=setup([[user]]);assert.deepEqual(await (await request(none,'GET','/now-playing')).json(),{});
 const invalid=setup();assert.equal((await invalid.app.request('/now-playing?did=handle',{headers:{authorization:'Bearer invalid'}})).status,500);assert.equal(invalid.queries.length,0);
}
{
 const m=setup();for(const [path,method,size] of [['now-playings','getDistinctScrobbles',10],['tracks','getTracks',100],['albums','getAlbums',100],['artists','getArtists',100]]){await m.app.request('/'+path);assert.deepEqual(m.posts.at(-1),{url:'library.'+method,data:{pagination:{skip:0,take:size}}})}await m.app.request('/tracks?size=2.5&offset=-2');assert.deepEqual(m.posts.at(-1).data.pagination,{skip:-2,take:2.5});
 for(const [query,url,data] of [['did=d&artisturi=a','library.getScrobblesPerDay',{user_did:'d'}],['artisturi=a&albumuri=b','library.getArtistScrobbles',{artist_id:'a'}],['albumuri=b&songuri=s','library.getAlbumScrobbles',{album_id:'b'}],['songuri=s','library.getTrackScrobbles',{track_id:'s'}],['','library.getScrobblesPerDay',{}]]){await m.app.request('/public/scrobbleschart?'+query);assert.deepEqual(m.posts.at(-1),{url,data})}
 const converted=setup([[{track:{uri:'song-uri'}}]]);await converted.app.request('/public/scrobbleschart?songuri=at://did/app.rocksky.scrobble/key');assert.deepEqual(converted.posts[0],{url:'library.getTrackScrobbles',data:{track_id:'song-uri'}});
}
{
 const row={track:{albumArt:null,artist:'a',title:'t',albumUri:null,artistUri:'artist',sha256:'hash'},scrobble:{id:'s',timestamp:123,uri:'scrobble'},user:{handle:'handle'}};
 const m=setup([[row]]);assert.deepEqual(await (await m.app.request('/public/scrobbles?size=2&offset=1')).json(),[{cover:null,artist:'a',title:'t',date:123,user:'handle',uri:'scrobble',albumUri:null,artistUri:'artist',tags:[],listeners:1,sha256:'hash',id:'s'}]);assert.equal(m.queries[0].limit,2);
 const own=setup([[user],[{scrobble:{id:'s'},track:{title:'t'}}]]);assert.equal((await request(own,'GET','/scrobbles')).status,200);assert.match(own.queries[1].where.sql,/is not null/);assert.deepEqual(own.queries[1].where.params,['caller']);
 const likes=setup([[user],[{track:{title:'t'}}]]);assert.deepEqual(await (await request(likes,'GET','/likes?size=1.5&offset=-2')).json(),[{title:'t'}]);assert.equal(likes.queries[1].limit,1.5);assert.equal(likes.queries[1].offset,-2);
 for(const path of ['tracks','albums','artists']){const m=setup([[{sha256:'hash',raw:true}]]);assert.deepEqual(await (await m.app.request('/'+path+'/hash')).json(),{sha256:'hash',raw:true});assert.deepEqual(m.queries[0].where.params,['hash'])}
 const artists=setup([[{artistName:'JAŸ-Z',track:{artist:'Jay-Z',albumArtist:null,id:'keep'}},{artistName:'Slipknot',track:{artist:'Cannons',albumArtist:null,id:'drop'}}]]);assert.deepEqual((await (await artists.app.request('/artists/hash/tracks')).json()).map(t=>t.id),['keep']);
 const albums=setup([[{track:{id:'one'}},{track:{id:'two'}}]]);assert.deepEqual(await (await albums.app.request('/albums/hash/tracks')).json(),[{id:'one'},{id:'two'}]);
}
{
 const m=setup(),original=globalThis.fetch;try{assert.equal((await m.app.request('/proxy-image')).status,400);globalThis.fetch=async()=>new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}});const r=await m.app.request('/proxy-image?url=https://image.test/x');assert.equal(r.headers.get('content-type'),'image/png');assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[1,2,3]);globalThis.fetch=async()=>new Response('bad',{status:404});assert.equal((await m.app.request('/proxy-image?url=x')).status,502);globalThis.fetch=async()=>{throw new Error('no')};assert.equal((await m.app.request('/proxy-image?url=x')).status,502)}finally{globalThis.fetch=original}
}
console.log('REST entry routes: durable submissions/errors, auth order, playback truth, catalogs/charts, credits guard, pagination and image proxy passed');
{
 const I=await import('../output/Rocksky.Index/index.js');const metrics=[],redis=[];const app=I.app({resolver:{resolveDidToHandle:()=>aff(()=>Nothing.value)},redis:{async eval(script,options){redis.push(options);return 1}},metrics:{requestCounter:{add(){}},requestDuration:{record(seconds,labels){metrics.push({seconds,labels})}}}})();
 const r=await app.request('/');assert.deepEqual(await r.json(),{status:'ok'});assert.equal(r.headers.get('access-control-allow-origin'),'*');assert.equal(r.headers.get('x-ratelimit-limit'),'1000');assert.equal(metrics.length,1);assert.equal(redis.length,1);
 const internal=await app.request('/internal/submissions/process',{method:'POST'});assert.equal(internal.status,401);assert.equal(redis.length,1,'internal submissions bypass public rate limiter');assert.equal(metrics.length,1);
 const usersRoutes=app.routes.filter(r=>r.path.startsWith('/users/'));assert.equal(usersRoutes.length,37);
 const sourceRoutes=async file=>[...(await readFile(new URL('../../apps/api/src/'+file,import.meta.url),'utf8')).matchAll(/app\.(get|post|put|patch|delete|options)\("([^"]+)"/g)].map(([,method,path])=>method.toUpperCase()+' '+path).sort();
 assert.deepEqual(usersRoutes.map(r=>r.method+' '+r.path.slice('/users'.length)).sort(),await sourceRoutes('users/app.ts'));
 const isolated=setup().app;
 assert.deepEqual(isolated.routes.map(r=>r.method+' '+r.path).sort(),await sourceRoutes('index.ts'));

 for(const prefix of ['/spotify','/storage','/apikeys','/access-tokens','/import','/notifications','/public/og','/uploads','/webscrobbler'])assert.ok(app.routes.some(r=>r.path===prefix||r.path.startsWith(prefix+'/')),prefix);
 console.log('REST app wiring: 37 user routes, all subapps, health/CORS/metrics/rate limits and internal-worker bypass passed');
}
