import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PgDialect} from 'drizzle-orm/pg-core';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='artist-rec-test';
const R=await import('../output/Rocksky.Xrpc.App.Rocksky.Feed.GetArtistRecommendations/index.js');const {fromAff}=await import('../output/Control.Promise/index.js');const Set=await import('../output/Data.Set/index.js');const {ordString}=await import('../output/Data.Ord/index.js');const run=a=>fromAff(a)();const has=(s,k)=>Set.member(ordString)(k)(s);const dialect=new PgDialect();
{
 const profile=R.genreProfile([{artistId:'a',scrobbles:90},{artistId:'b',scrobbles:4},{artistId:'c',scrobbles:null}])([{id:'a',genres:['rock']},{id:'b',genres:['incidental']},{id:'c',genres:['rare']}])(['liked']);assert.equal(has(profile,'rock'),true);assert.equal(has(profile,'liked'),true);assert.equal(has(profile,'incidental'),false);assert.equal(has(profile,'rare'),false);
}
function mocks(readAnswers,writeAnswers=[]){const queries=[];function db(which,answers){return {select(fields){const call={which,fields:Object.keys(fields)};queries.push(call);const answer=answers.shift();assert.ok(answer,'Unexpected select '+call.fields);const q={from(){return q},leftJoin(){return q},where(w){call.query=dialect.sqlToQuery(w);return q},groupBy(){return q},orderBy(){return q},limit(n){call.limit=n;return q},async execute(){return answer}};return q}}}return {ctx:{readDb:db('read',readAnswers),db:db('primary',writeAnswers)},queries,readAnswers,writeAnswers}}
{
 const m=mocks([[{id:'u'}],[]]);assert.deepEqual(await run(R.getArtistRecommendations(m.ctx)({did:'x',limit:null})),{artists:[]});assert.equal(m.queries.length,2);
 const missing=mocks([[]]);await assert.rejects(run(R.getArtistRecommendations(missing.ctx)({did:'missing',limit:null})),/User not found/);
}
{
 const heard=Array.from({length:501},(_,i)=>({artistId:'heard'+i,scrobbles:1}));const scores=Array.from({length:9},(_,i)=>({artistId:'n'+i,neighbourUserId:'neighbor',playScore:100-i}));scores.push({artistId:'heard500',neighbourUserId:'neighbor',playScore:999},{artistId:'n0',neighbourUserId:'weak',playScore:5},{artistId:'wrongGenre',neighbourUserId:'neighbor',playScore:999});
 const artists=Array.from({length:9},(_,i)=>({id:'n'+i,name:'Artist '+i,genres:['rock'],uri:null,picture:i===0?'pic':null}));
 const m=mocks([[{id:'u'}],heard,[{id:'heard0',genres:['rock']}],[{userId:'neighbor',sharedCount:501},{userId:'weak',sharedCount:1}],scores,[...artists,{id:'wrongGenre',name:'Wrong',genres:['jazz']}],[{id:'heard500'},{id:'n0'},{id:'n8'}],artists],[[]]);
 const result=await run(R.getArtistRecommendations(m.ctx)({did:'handle.test',limit:10}));assert.equal(result.artists.length,10);assert.deepEqual(result.artists.map(a=>a.id),['n0','n1','n2','n3','n4','n5','n6','n7','n8','n8']);assert.equal(result.artists[0].recommendationScore,100);assert.equal(result.artists[0].source,'neighbour');assert.equal(result.artists[8].recommendationScore,0);assert.equal(result.artists[9].source,'serendipity');assert.equal('uri' in result.artists[0],false);assert.equal('picture' in result.artists[1],false);assert.equal(result.artists[0].picture,'pic');
 assert.equal(m.readAnswers.length,0);assert.equal(m.writeAnswers.length,0);assert.equal(m.queries.find(q=>q.which==='primary').fields[0],'trackId');const neighbour=m.queries.find(q=>q.fields.includes('playScore'));assert.equal(neighbour.limit,500);assert.ok(neighbour.query.params.includes('heard499'));assert.equal(neighbour.query.params.includes('heard500'),false);const supplement=m.queries.find(q=>q.fields.length===1&&q.limit===100);assert.ok(supplement.query.params.includes('heard500'));assert.match(supplement.query.sql,/@> ARRAY/);
}
{
 const m=mocks([[{id:'u'}],[{artistId:'heard',scrobbles:0}],[{id:'heard',genres:[]}],[{genres:['liked','liked']}],[{userId:'neighbor',sharedCount:1}],[],[{id:'a'},{id:'heard'}],[{id:'a'},{id:'b'}],[{id:'a',name:'A',uri:null,picture:null,genres:['liked']},{id:'b',name:'Various Artists',uri:null,picture:null,genres:['liked']}]],[Array.from({length:205},(_,i)=>({trackId:'t'+i}))]);
 const result=await run(R.getArtistRecommendations(m.ctx)({did:'u',limit:2}));assert.deepEqual(result.artists.map(r=>r.id),['a']);assert.equal(result.artists[0].recommendationScore,0);const liked=m.queries.find(q=>q.fields.join()==='genres');assert.equal(liked.query.params.length,200);assert.ok(m.queries.some(q=>q.limit===300));assert.ok(m.queries.some(q=>q.limit===100));
}
console.log('Artist recommendations: weighted/liked genres, empty history, neighbour maxima, full heard filtering, supplements, duplicate-tail parity and hydration passed');
