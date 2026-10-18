import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PgDialect} from 'drizzle-orm/pg-core';
import sharp from 'sharp';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='event-script-test';
const E=await import('../output/Rocksky.Scripts.Event/index.js');const {fromAff,toAffE}=await import('../output/Control.Promise/index.js');const {Just,Nothing}=await import('../output/Data.Maybe/index.js');
const run=a=>fromAff(a)();const aff=f=>toAffE(()=>Promise.resolve().then(f));const dialect=new PgDialect();
function context(similar=[]){const queries=[];const db={select(fields){const artist=Object.keys(fields).length===1;const q={from(){return q},innerJoin(){return q},where(w){queries.push(dialect.sqlToQuery(w));return q},limit(n){assert.equal(n,artist?1:5);return q},async execute(){return artist?[{uri:'at://known/artist/key'}]:similar}};return q}};return {ctx:{db},queries}}
function questions(overrides={}){const history=[];const values={
 'Event name':'  The Show  ','Description (optional)':'', 'Starts at (ISO-8601)':['bad-date','2026-12-01T20:00:00+01:00'],'Ends at (ISO-8601, optional)':'',
 'Attendance mode':'community.lexicon.calendar.event#hybrid','Status':'community.lexicon.calendar.event#scheduled','Venue name':' Hall ','Country (ISO 3166 code, e.g. FR)':' fr ',
 'City (optional)':'Paris','Region / state (optional)':'','Street address (optional)':'','Postal code (optional)':'','Latitude (optional)':'48','Longitude (optional)':'2',
 'Stream / online venue URL':'https://stream.test','Event website (optional)':'https://event.test','Kind of event':'festival','Main genre (optional)':'',
 'Tags, comma-separated (optional)':()=>[' rock ','',' live '],'Artist name (headliner)':' Artist ','Artist AT-URI (optional)':q=>q.initial,'Role':'headliner','Stage (optional)':'Main',
 'Set time (ISO-8601, optional)':'','MusicBrainz artist id (optional)':'','Next artist (leave empty to finish)':'',
 'Ticketmaster event id (optional)':'tm1','Songkick event id (optional)':'','Bandsintown event id (optional)':'','Resident Advisor event id (optional)':'','setlist.fm event id (optional)':'','DICE event id (optional)':'','Eventbrite event id (optional)':'',
 'Tickets URL (optional)':'','Poster image URL (optional)':'','Publish anyway?':true,'Do you want to proceed?':true,...overrides};
 return {history,ask:q=>aff(()=>{history.push(q);assert.ok(q.message in values,q.message);const v=values[q.message];return typeof v==='function'?v(q):Array.isArray(v)?v.shift():v})};}
let input;
{
 const c=context([{name:'Existing',uri:'at://existing'}]),q=questions();const result=await run(E.collectInput(c.ctx)(q.ask));assert.ok(result instanceof Just);input=result.value0;
 assert.equal(input.calendar.name,'The Show');assert.equal(input.calendar.startsAt,'2026-12-01T19:00:00.000Z');assert.equal('description' in input.calendar,false);assert.equal('endsAt' in input.calendar,false);assert.equal(input.calendar.locations.length,3);assert.equal(input.calendar.locations[0].country,'FR');assert.equal(input.calendar.locations[1].latitude,'48');assert.equal(input.calendar.locations[2].name,'Online');assert.deepEqual(input.music.tags,['rock','live']);assert.deepEqual(input.music.externalIds,{ticketmaster:'tm1'});assert.equal(input.music.artists[0].uri,'at://known/artist/key');assert.equal(input.music.artists[0].stage,'Main');assert.equal(input.calendar.createdAt,input.music.createdAt);assert.equal('ticketsUrl' in input.music,false);
 assert.equal(q.history.find(q=>q.message==='Publish anyway?').initial,false);assert.equal(q.history.find(q=>q.message==='Do you want to proceed?').initial,true);assert.match(c.queries[1].sql,/AT TIME ZONE 'UTC'/);assert.deepEqual(c.queries[1].params,[0,'Artist','2026-12-01']);
}
{
 const c=context([{name:'Existing',uri:'at://existing'}]),q=questions({'Publish anyway?':false});assert.ok(await run(E.collectInput(c.ctx)(q.ask)) instanceof Nothing);assert.equal(q.history.some(q=>q.message==='Do you want to proceed?'),false);
}
{
 const q=questions({'Attendance mode':'community.lexicon.calendar.event#virtual','Kind of event':'concert','Tags, comma-separated (optional)':()=>[],'Ticketmaster event id (optional)':''});const result=(await run(E.collectInput(context().ctx)(q.ask))).value0;assert.equal(result.calendar.locations.length,1);assert.equal('externalIds' in result.music,false);assert.equal('tags' in result.music,false);assert.equal('stage' in result.music.artists[0],false);assert.equal(q.history.some(q=>q.message==='Venue name'),false);
}
for(const overrides of [{'Event name':''},{'Country (ISO 3166 code, e.g. FR)':'x'},{'Artist name (headliner)':''}])await assert.rejects(run(E.collectInput(context().ctx)(questions(overrides).ask)),/needs/);
const originalFetch=globalThis.fetch;
try {
 globalThis.fetch=async()=>new Response(null,{status:200,headers:{'content-type':'image/png; charset=utf-8'}});assert.equal((await run(E.imageType('https://example.test/image'))).value0,'image/png');
 globalThis.fetch=async()=>new Response(null,{status:200,headers:{'content-type':'text/html'}});assert.ok(await run(E.imageType('https://example.test/image.png')) instanceof Nothing);
 globalThis.fetch=async()=>new Response(null,{status:403,headers:{'content-type':'text/html'}});assert.equal((await run(E.imageType('https://example.test/image.JPEG?q=x'))).value0,'image/jpeg');assert.ok(await run(E.imageType('file:///image.png')) instanceof Nothing);
 globalThis.fetch=async()=>{throw Error('HEAD refused')};assert.equal((await run(E.imageType('https://example.test/image.avif'))).value0,'image/avif');
 const records=[],uploads=[];const agent={assertDid:'did:plc:publisher',com:{atproto:{repo:{async createRecord(r){records.push(r);return {data:{uri:`at://publisher/${r.collection}/key`,cid:`cid-${records.length}`}}},async uploadBlob(bytes,options){uploads.push({bytes,options});return {data:{blob:{$type:'blob',ref:'test'}}}}}}}};
 const png=await sharp({create:{width:2,height:3,channels:3,background:'red'}}).png().toBuffer();globalThis.fetch=async()=>new Response(png,{headers:{'content-type':'image/png; charset=utf-8'}});
 const out=await run(E.publish(agent)({...input,imageUrl:new Just('https://example.test/poster.png')}));assert.equal(records.length,2);assert.equal(uploads.length,1);assert.equal(uploads[0].options.encoding,'image/png');assert.deepEqual(records[0].record.media[0].aspect_ratio,{width:2,height:3});assert.deepEqual(records[1].record.subject,{uri:out.calendar.uri,cid:'cid-1'});assert.equal(records[0].validate,true);assert.equal(records[1].repo,'did:plc:publisher');
 globalThis.fetch=async()=>new Response(null,{status:404});assert.ok(await run(E.uploadPoster(agent)('Name')('https://example.test/poster')) instanceof Nothing);
 globalThis.fetch=async()=>new Response('not image');await assert.rejects(run(E.uploadPoster(agent)('Name')('https://example.test/poster')));
} finally {globalThis.fetch=originalFetch}
console.log('Event script: prompts, dates, locations, lineup, duplicate/cancel gates, MIME fallback, poster blob and linked publication passed');
