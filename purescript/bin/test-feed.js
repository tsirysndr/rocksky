import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import axios from 'axios';
import {getTableName} from 'drizzle-orm';
import {PgDialect} from 'drizzle-orm/pg-core';
import {createServer} from '@atproto/xrpc-server';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';
for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='feed-test';
Object.assign(process.env,{PUBLIC_URL:'https://rocksky.test',ROCKSKY_FEEDGEN_DID:'did:web:rocksky.test',ROCKSKY_FEEDGEN_PORT:'8003'});
const Feed=await import('../output/Rocksky.Xrpc.App.Rocksky.Feed.GetFeed/index.js');
const Stories=await import('../output/Rocksky.Xrpc.App.Rocksky.Feed.GetStories/index.js');
const Skeleton=await import('../output/Rocksky.Xrpc.App.Rocksky.Feed.Skeleton/index.js');
const Generators=await import('../output/Rocksky.Xrpc.App.Rocksky.Feed.GetFeedGenerators/index.js');
const Generator=await import('../output/Rocksky.Xrpc.App.Rocksky.Feed.GetFeedGenerator/index.js');
const {loadLexicons}=await import('../output/Rocksky.Lexicon/index.js');
const {fromAff}=await import('../output/Control.Promise/index.js');
const {Just,Nothing}=await import('../output/Data.Maybe/index.js');
const run=aff=>fromAff(aff)();const none=Nothing.value;const dialect=new PgDialect();
function mock(responses){const queries=[],projections=[];const db={select(projection){projections.push(projection);let table;const q={from(t){table=getTableName(t);return q},leftJoin(){return q},innerJoin(){return q},where(c){queries.push({table,sql:dialect.sqlToQuery(c)});return q},orderBy(){return q},groupBy(){return q},limit(n){queries.push({limit:n});return q},async execute(){assert.ok(responses[table]?.length,'Unexpected read '+table);return responses[table].shift()}};return q}};return {db,queries,projections,done(){for(const rows of Object.values(responses))assert.equal(rows.length,0)}};}
const date=new Date('2026-01-01T00:00:00Z');const feed={id:'f',uri:'at://did:web:rocksky.test/app.rocksky.feed.generator/all',did:'did:web:rocksky.test',displayName:'All',description:null,avatar:null};
assert.equal(Skeleton.baseUrl(false)(feed.did),'http://localhost:8003');assert.equal(Skeleton.baseUrl(true)(feed.did),'http://localhost:8003');assert.equal(Skeleton.baseUrl(false)('did:web:external.test'),'https://external.test');
assert.equal(Skeleton.baseUrl(true)('did:web:external.test'),'https://external.test');
assert.notEqual(Feed.cacheKey({feed:feed.uri})(1)(none),Feed.cacheKey({feed:feed.uri})(1)(new Just('did:viewer')));
assert.notEqual(Feed.cacheKey({feed:feed.uri})(1)(none),Feed.cacheKey({feed:feed.uri})(2)(none));
{
 const ctx={redis:{async get(key){return key.startsWith('feed:ver:')?'2':JSON.stringify({feed:[{cached:true}],cursor:'next'})}}};assert.deepEqual(await run(Feed.getFeed(ctx)({feed:feed.uri})(none)),{feed:[{cached:true}],cursor:'next'});
}
const priorAdapter=axios.defaults.adapter;const requests=[];let skeleton={feed:[],cursor:'next'};
axios.defaults.adapter=async config=>{requests.push(config);return {data:skeleton,status:200,statusText:'OK',headers:{},config}};
try{
 {
  const m=mock({feeds:[[feed]],scrobbles:[[]]}),writes=[];
  const result=await run(Feed.getFeed({db:m.db,redis:{async get(){return null},async setEx(...args){writes.push(args)}}})({feed:feed.uri,limit:12,cursor:'page'})(none));
  assert.deepEqual(result,{feed:[],cursor:'next'});assert.equal(writes[0][1],30);assert.equal(requests.at(-1).url,'http://localhost:8003/xrpc/app.rocksky.feed.getFeedSkeleton');assert.equal(requests.at(-1).params.limit,12);assert.equal(requests.at(-1).params.cursor,'page');m.done();
 }
 {
  const row={scrobbles:{id:'s',uri:'scrobble',timestamp:date,createdAt:date,updatedAt:date},tracks:{id:'t',uri:'song',albumArt:'cover',title:'Song'},users:{handle:'u.test',displayName:null,avatar:null},artists:{genres:['jazz']}};
  const m=mock({scrobbles:[[row]],loved_tracks:[[{trackId:'t',count:3}],[{trackId:'t'}]]});
  const result=await run(Feed.hydrate({db:m.db})(['scrobble'])(undefined)(new Just('did:viewer')));const s=result.feed[0].scrobble;
  assert.equal(s.id,'s');assert.equal(s.trackUri,'song');assert.equal(s.cover,'cover');assert.equal(s.albumArt,undefined);assert.equal(s.likesCount,3);assert.equal(s.liked,true);assert.deepEqual(s.tags,['jazz']);assert.equal(s.date,date.toISOString());
  assert.ok(!('lyrics' in m.projections[0].tracks));assert.deepEqual(Object.keys(m.projections[0].artists),['genres']);m.done();
 }
 {
  const row={trackId:'t',title:'Song',timestamp:date,uri:'s',album:'Album',did:'did:author'};
  const m=mock({scrobbles:[[],[],[row]],loved_tracks:[[{trackId:'t',count:4,liked:true}]]});
  const result=await run(Stories.retrieve({db:m.db})({size:2})(new Just('did:viewer')));
  assert.equal(result.stories[0].likesCount,4);assert.equal(result.stories[0].liked,true);assert.equal(result.stories[0].id,'t');assert.equal(result.stories[0].createdAt,date.toISOString());
  const statements=m.queries.filter(q=>q.table==='scrobbles');assert.match(statements[0].sql.sql,/make_interval/);assert.match(statements[1].sql.sql,/make_interval/);assert.doesNotMatch(statements[2].sql.sql,/make_interval/);assert.match(statements[2].sql.sql,/DISTINCT ON \(inner_s.user_id\)/);m.done();
 }
 {
  const row={trackId:null,timestamp:date};const m=mock({follows:[[{id:'followed'}]],scrobbles:[[row]]});
  const result=await run(Stories.retrieve({db:m.db})({following:true,size:1})(new Just('did:viewer')));assert.equal(result.stories[0].liked,false);assert.equal(result.stories[0].likesCount,0);
  const q=m.queries.find(q=>q.table==='scrobbles').sql;assert.ok(q.params.includes('followed'));assert.match(q.sql,/inner_s.user_id/);m.done();
 }
 {
  const m=mock({follows:[[]]});assert.deepEqual(await run(Stories.retrieve({db:m.db})({following:true})(new Just('did:viewer'))),{stories:[]});m.done();
 }
 {
  skeleton={feed:[]};const m=mock({feeds:[[feed]]});assert.deepEqual(await run(Stories.retrieve({db:m.db})({feed:feed.uri,following:true})(new Just('did:viewer'))),{stories:[]});m.done();
 }
 {
  skeleton={feed:[{scrobble:'old-scrobble'}]};
  const row={trackId:null,timestamp:new Date('2020-01-01'),uri:'old-scrobble'};
  const m=mock({feeds:[[feed]],scrobbles:[[row]]});
  const result=await run(Stories.retrieve({db:m.db})({feed:feed.uri,size:80})(none));
  assert.equal(result.stories[0].uri,'old-scrobble');
  assert.equal(requests.at(-1).url,'http://localhost:8003/xrpc/app.rocksky.feed.getFeedSkeleton');
  const statements=m.queries.filter(q=>q.table==='scrobbles');assert.equal(statements.length,1);
  assert.doesNotMatch(statements[0].sql.sql,/make_interval/);assert.ok(statements[0].sql.params.includes('old-scrobble'));m.done();
 }
 const server=createServer(await run(loadLexicons)),methods=new Map();server.method=(id,config)=>{methods.set(id,config);return server};
 {
  skeleton={feed:[],cursor:'next'};
  const m=mock({feeds:[[feed],[feed],[feed]],scrobbles:[[],[],[]]});const cache=new Map();let version=0;
  Feed.register(server)({db:m.db,authVerifier:()=>{},redis:{
   async get(key){await new Promise(resolve=>setTimeout(resolve,5));return key.startsWith('feed:ver:')?String(version):cache.get(key)??null},
   async setEx(key,ttl,value){assert.equal(ttl,30);cache.set(key,value)}
  }})();
  const call=methods.get('app.rocksky.feed.getFeed').handler;const before=requests.length;
  const responses=await Promise.all(Array.from({length:8},()=>call({params:{feed:feed.uri,limit:30}})));
  assert.equal(requests.length-before,1);assert.ok(responses.every(r=>r.body.cursor==='next'));
  version++;await call({params:{feed:feed.uri,limit:30}});assert.equal(requests.length-before,2);
  await call({params:{feed:feed.uri,limit:31}});assert.equal(requests.length-before,3);m.done();
 }
 Stories.register(server)({authVerifier:()=>{}})();await assert.rejects(methods.get('app.rocksky.feed.getStories').handler({params:{following:true}}),/Authentication required/);
 {
  const m=mock({feeds:[[],[{feeds:feed,users:{id:'u',did:'did:u',handle:'u.test',displayName:'U',avatar:null}}]]});
  Generator.register(server)({readDb:m.db})();Generators.register(server)({readDb:m.db})();
  const missing=await methods.get('app.rocksky.feed.getFeedGenerator').handler({params:{feed:'missing'}});assert.equal(JSON.stringify(missing.body),'{}');
  const list=await methods.get('app.rocksky.feed.getFeedGenerators').handler({params:{size:0}});assert.equal(list.body.feeds[0].name,'All');assert.equal(list.body.feeds[0].creator.did,'did:u');assert.equal(m.queries.at(-1).limit,100);m.done();
 }
}finally{axios.defaults.adapter=priorAdapter}
console.log('Feed cache isolation, skeleton routing, hydration, likes, story windows/following and generator metadata checks passed');
