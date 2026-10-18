import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PgDialect} from 'drizzle-orm/pg-core';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='album-rec-test';
const R=await import('../output/Rocksky.Xrpc.App.Rocksky.Feed.GetAlbumRecommendations/index.js');const {fromAff}=await import('../output/Control.Promise/index.js');const run=a=>fromAff(a)();const dialect=new PgDialect();
function mocks(readAnswers,writeAnswers=[]){const queries=[];function db(which,answers){return {select(fields){const call={which,fields:Object.keys(fields)};queries.push(call);const answer=answers.shift();assert.ok(answer,'Unexpected select '+call.fields);const q={from(){return q},leftJoin(){return q},innerJoin(){call.inner=true;return q},where(w){call.query=dialect.sqlToQuery(w);return q},groupBy(){return q},orderBy(){return q},limit(n){call.limit=n;return q},async execute(){return answer}};return q}}}return {ctx:{readDb:db('read',readAnswers),db:db('primary',writeAnswers)},queries,readAnswers,writeAnswers}}
const artist=(id,genres=['rock'])=>({id,uri:'at://'+id,name:id,genres});const album=(id,artist='Known')=>({id,uri:null,title:id,artist,artistUri:null,year:null,albumArt:null});
{
 const m=mocks([[{id:'u'}],[],[],[]],[[]]);assert.deepEqual(await run(R.getAlbumRecommendations(m.ctx)({did:'user',limit:null})),{albums:[]});assert.equal(m.queries.length,5);
}
{
 const m=mocks([
  [{id:'u'}],[{albumId:'heard-id'},{albumId:null}],[{albumUri:'at://heard-uri'},{albumUri:null}],
  [{artistId:'known',scrobbles:10},{artistId:'zero',scrobbles:null}],
  [{id:'known',genres:['rock']},{id:'zero',genres:['jazz']}],
  [artist('known'),artist('zero'),{id:'various',uri:'at://various',name:'Various Artists'}],
  [{id:'known-album',artistUri:'at://known'},{id:'zero-album',artistUri:'at://zero'},{id:'null-uri',artistUri:null},{id:'known-album',artistUri:'at://known'}],
  [{userId:'neighbor',sharedCount:2}],
  [{artistId:'new',neighbourUserId:'neighbor',playScore:20},{artistId:'known',neighbourUserId:'neighbor',playScore:100},{artistId:'wrong',neighbourUserId:'neighbor',playScore:30},{artistId:'various',neighbourUserId:'neighbor',playScore:40}],
  [artist('new'),artist('wrong',['jazz']),{...artist('various'),name:'Various Artists'}],
  [{id:'new-album',artistUri:'at://new'},{id:'known-album',artistUri:'at://new'}],
  [album('known-album'),album('new-album','New'),album('zero-album','Various Artists')]
 ],[[]]);
 const result=await run(R.getAlbumRecommendations(m.ctx)({did:'handle',limit:50}));assert.deepEqual(result.albums.map(a=>[a.id,a.source,a.recommendationScore]),[['new-album','new-artist',20],['known-album','known-artist',10]]);assert.equal('year' in result.albums[0],false);assert.equal('artistUri' in result.albums[0],false);assert.equal(m.readAnswers.length,0);
 const pools=m.queries.filter(q=>q.fields.join()==='id,artistUri');assert.equal(pools.length,2);for(const q of pools){assert.equal(q.limit,500);assert.ok(q.query.params.includes('heard-id'));assert.ok(q.query.params.includes('at://heard-uri'));}assert.deepEqual(pools[1].query.params,['at://new','heard-id','at://heard-uri']);assert.equal(m.queries.find(q=>q.fields.includes('playScore')).limit,150);assert.equal(m.queries.find(q=>q.fields.includes('scrobbles')).limit,200);assert.equal(m.queries.find(q=>q.fields.join()==='albumUri').inner,true);
}
{
 // No genre profile admits new artists with no genres. Known artists remain
 // eligible even when another known artist dominates the genre profile.
 const m=mocks([[{id:'u'}],[],[],[{artistId:'zero',scrobbles:null}],[{id:'zero',genres:['jazz']}],[artist('zero')],[{id:'zero-album',artistUri:'at://zero'}],[{userId:'neighbor',sharedCount:1}],[{artistId:'new',neighbourUserId:'neighbor',playScore:1}],[artist('new',null)],[{id:'new-album',artistUri:'at://new'}],[album('new-album'),album('zero-album')]],[[]]);
 const result=await run(R.getAlbumRecommendations(m.ctx)({did:'user',limit:2}));assert.deepEqual(result.albums.map(a=>a.recommendationScore),[1,0]);
}
console.log('Album recommendations: ID+URI history exclusions, known artist familiarity, new artist scoring/genres, duplicate merge, null weights and sparse hydration passed');
