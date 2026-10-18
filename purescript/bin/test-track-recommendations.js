import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PgDialect} from 'drizzle-orm/pg-core';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='track-rec-test';
const R=await import('../output/Rocksky.Xrpc.App.Rocksky.Feed.GetRecommendations/index.js');const {fromAff}=await import('../output/Control.Promise/index.js');const Set=await import('../output/Data.Set/index.js');const {ordString}=await import('../output/Data.Ord/index.js');const run=a=>fromAff(a)();const dialect=new PgDialect();
function mocks(readAnswers,writeAnswers=[]){const queries=[];function db(which,answers){return {select(fields){const call={which,fields:Object.keys(fields)};queries.push(call);const answer=answers.shift();assert.ok(answer,'Unexpected select '+call.fields);const q={from(){return q},leftJoin(){return q},innerJoin(){return q},where(w){call.query=dialect.sqlToQuery(w);return q},groupBy(){return q},orderBy(){return q},limit(n){call.limit=n;return q},async execute(){return answer}};return q}}}return {ctx:{readDb:db('read',readAnswers),db:db('primary',writeAnswers)},queries,readAnswers,writeAnswers}}
const track=(id,artistUri='at://'+id,genres=['rock'])=>({id,title:id,artist:'Artist',album:'Album',albumArt:null,trackUri:'at://track/'+id,artistUri,albumUri:null,genres});
{
 const m=mocks([[{id:'u'}],[],[]],[[]]);assert.deepEqual(await run(R.getRecommendations(m.ctx)({did:'u',limit:null})),{recommendations:[]});assert.equal(m.queries.length,4);
}
{
 const heard=Array.from({length:501},(_,i)=>({trackId:'heard'+i}));
 const plays=[{trackId:'plain',neighbourUserId:'n',playScore:20},{trackId:'social',neighbourUserId:'n',playScore:2},{trackId:'other',neighbourUserId:'n',playScore:8},{trackId:'plain',neighbourUserId:'weak',playScore:1},{trackId:'heard500',neighbourUserId:'n',playScore:999},{trackId:'ownlove',neighbourUserId:'n',playScore:999}];
 const m=mocks([[{id:'u'}],heard,[{artistId:'known'}],[{genres:['rock'],scrobbles:100}],[{genres:['rock']}],[{userId:'n',sharedCount:1},{userId:'weak',sharedCount:0.1}],plays,
  ['plain','social','other','likedOnly'].map(id=>({id,artist:'Artist',genres:['rock']})),[{artistId:'new'},{artistId:'wrong'},{artistId:null}],
  [{id:'new',name:'New',genres:['rock']},{id:'wrong',name:'Wrong',genres:['jazz']}],[{uri:'at://new'}],[{id:'plain'},{id:'tail'}],
  [track('plain','at://same'),track('social','at://same'),track('other'),track('likedOnly',null),track('tail')]
 ],[[{trackId:'ownlove'}],[{trackId:'social',userId:'n'},{trackId:'likedOnly',userId:'n'},{trackId:'plain',userId:'weak'}],[{trackId:'social',count:'7'},{trackId:'plain',count:3}]]);
 const result=await run(R.getRecommendations(m.ctx)({did:'u',limit:5}));assert.deepEqual(result.recommendations.map(r=>r.title),['plain','other','likedOnly','tail','social']);assert.deepEqual(result.recommendations.map(r=>r.recommendationScore),[20,8,5,0,10]);assert.equal(result.recommendations[0].source,'neighbour');assert.equal(result.recommendations[4].source,'social');assert.equal(result.recommendations[4].likesCount,7);assert.equal(result.recommendations[2].likesCount,0);assert.equal('artistUri' in result.recommendations[2],false);assert.equal('id' in result.recommendations[0],false);assert.equal('albumArt' in result.recommendations[0],false);assert.equal(m.readAnswers.length,0);assert.equal(m.writeAnswers.length,0);
 const neighbor=m.queries.find(q=>q.fields.includes('playScore'));assert.equal(neighbor.query.params.includes('heard500'),false);assert.equal(neighbor.limit,500);const neighborLoved=m.queries.find(q=>q.which==='primary'&&q.fields.includes('userId'));assert.ok(neighborLoved.query.params.includes('heard500'));assert.ok(neighborLoved.query.params.includes('ownlove'));const tail=m.queries.find(q=>q.limit===3);assert.ok(tail.query.params.includes('heard500'));assert.ok(tail.query.params.includes('ownlove'));assert.deepEqual(m.queries.find(q=>q.fields.join()==='uri').query.params,['new']);
}
{
 const m=mocks([[{id:'u'}],[{trackId:'heard'}],[{artistId:'known'}],[{genres:['rock'],scrobbles:1}],[{userId:'n',sharedCount:1}],[],[{id:'heard'},{id:'supplement'}],[],[track('supplement')]],[[],[],[]]);
 const result=await run(R.getRecommendations(m.ctx)({did:'u',limit:2}));assert.deepEqual(result.recommendations.map(r=>r.title),['supplement']);assert.equal(result.recommendations[0].source,'serendipity');assert.ok(m.queries.some(q=>q.limit===5));
}
{
 // Hydration must reject unverified genres, drop compilations, and use null
 // artist URI fallback per track rather than grouping all nulls together.
 let genres=Set.empty;genres=Set.insert(ordString)('rock')(genres);
 const candidates=['a','b','c','d'].map((trackId,i)=>({trackId,score:4-i,source:'neighbour'}));
 const m=mocks([[track('a',null),track('b',null),track('c',null,null),{...track('d'),artist:'Various Artists'}]],[[]]);const result=await run(R.hydrate(m.ctx)({candidates,userGenres:genres}));assert.deepEqual(result.recommendations.map(r=>r.title),['a','b']);
}
console.log('Track recommendations: social boost/winning source, loved-only candidates, full exclusions, genre supplements, serendipity and diversity/likes hydration passed');
