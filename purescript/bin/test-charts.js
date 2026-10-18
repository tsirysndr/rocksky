import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PgDialect} from 'drizzle-orm/pg-core';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');
process.env.NODE_ENV='test';
for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='chart-test';
const C=await import('../output/Rocksky.Xrpc.App.Rocksky.Charts.Common/index.js');
const Artists=await import('../output/Rocksky.Xrpc.App.Rocksky.Charts.GetTopArtists/index.js');
const Tracks=await import('../output/Rocksky.Xrpc.App.Rocksky.Charts.GetTopTracks/index.js');
const Scrobblers=await import('../output/Rocksky.Xrpc.App.Rocksky.Charts.GetTopScrobblers/index.js');
const {fromAff}=await import('../output/Control.Promise/index.js');
const {Just,Nothing}=await import('../output/Data.Maybe/index.js');
const run=aff=>fromAff(aff)();
const dialect=new PgDialect();
function context(responses){
 const queries=[];let releases=0;
 const client={async query(config,params){queries.push({sql:config.text??config,params});assert.ok(responses.length,'Unexpected query');return {rows:responses.shift()};},release(){releases++}};
 return {ctx:{pools:{readPool:{async connect(){return client}}}},queries,done(){assert.equal(responses.length,0);assert.equal(releases,1)}};
}
{
 const m=context([[{id:'a',scrobbles:'12',uniqueListeners:'4'},{id:'missing',scrobbles:1,uniqueListeners:1}],[['a','Artist',null,'hash',null,['jazz']]]]);
 const result=await run(Artists.retrieve(m.ctx)({}));assert.equal(result.length,1);assert.equal(result[0].playCount,12);assert.equal(result[0].uniqueListeners,4);assert.deepEqual(result[0].tags,['jazz']);
 assert.match(m.queries[0].sql,/chart_artists_mv/);assert.match(m.queries[0].sql,/Various Artists/);assert.deepEqual(m.queries[0].params,[50,0]);m.done();
}
{
 const m=context([[['u']],[{id:'t',scrobbles:'7',uniqueListeners:'1'}],[['t','Song','Artist','Album Artist',null,null,'Album',120000,2,null,null,null,'hash','rock','2024-01-02 00:00:00']]]);
 const result=await run(Tracks.retrieve(m.ctx)({did:'artist.test',startDate:'2024-01-01',limit:10,offset:3}));
 assert.equal(result[0].createdAt,'2024-01-02T00:00:00.000Z');assert.deepEqual(result[0].tags,['rock']);assert.equal(result[0].playCount,7);
 assert.match(m.queries[0].sql,/"users"\."handle"/);assert.match(m.queries[1].sql,/ORDER BY c.scrobbles DESC/);assert.match(m.queries[1].sql,/s.timestamp >=/);assert.ok(m.queries[1].params.includes('u'));m.done();
}
{
 const m=context([[]]);assert.deepEqual(await run(Artists.retrieve(m.ctx)({did:'missing'})),[]);m.done();
}
{
 const m=context([[]]);await run(Tracks.retrieve(m.ctx)({startDate:'2024-01-01',endDate:'2024-01-02'}));assert.match(m.queries[0].sql,/ORDER BY c.unique_listeners DESC/);assert.match(m.queries[0].sql,/s.timestamp <=/);m.done();
}
const d=s=>new Date('2024-01-01T'+s+'Z');
function range(start,end,covered){return dialect.sqlToQuery(Scrobblers.rangeQuery(d(start))(d(end))(covered?new Just(d(covered)):Nothing.value)(20)(0)());}
{
 const q=range('00:15:00','04:30:00','03:00:00');
 assert.equal((q.sql.match(/UNION ALL/g)||[]).length,4);
 assert.ok(q.params.includes('2024-01-01 01:00:00'));assert.ok(q.params.includes('2024-01-01 03:00:00'));
 assert.ok(q.params.includes('2024-01-01T03:00:00.000Z'));assert.match(q.sql,/u.is_bot = false/);assert.match(q.sql,/CROSS JOIN LATERAL unnest/);
}
{
 const q=range('01:00:00','02:00:00','05:00:00');
 assert.equal((q.sql.match(/UNION ALL/g)||[]).length,2); // inclusive end instant comes from live tail
 assert.ok(q.params.includes('2024-01-01T02:00:00.000Z'));
}
{
 const q=range('04:10:00','04:20:00','03:00:00');
 assert.doesNotMatch(q.sql,/user_hour_scrobbles_mv/);assert.doesNotMatch(q.sql,/UNION ALL/);
 assert.ok(q.params.includes('2024-01-01T04:10:00.000Z'));assert.ok(q.params.includes('2024-01-01T04:20:00.000Z'));
}
{
 const q=range('00:00:00','04:30:00',null);assert.doesNotMatch(q.sql,/user_hour_scrobbles_mv/);assert.doesNotMatch(q.sql,/UNION ALL/);
}
{
 const statements=[];const ctx={readDb:{async execute(q){statements.push(dialect.sqlToQuery(q));return {rows:[{id:'u',did:'did:u',handle:'u.test',display_name:null,avatar:'',scrobbles:'9',unique_artists:'3',unique_tracks:'4'}]}}}};
 const result=await run(Scrobblers.retrieve(ctx)({}));assert.equal(result[0].scrobbles,9);assert.equal(result[0].uniqueTracks,4);assert.equal(result[0].displayName,null);assert.match(statements[0].sql,/top_scrobblers_mv/);
}
{
 const statements=[],responses=[[{through:'2024-01-01T03:00:00Z'}],[]];const ctx={readDb:{async execute(q){statements.push(dialect.sqlToQuery(q));return {rows:responses.shift()}}}};
 await run(Scrobblers.retrieve(ctx)({startDate:'2024-01-01T00:15:00Z',endDate:'2024-01-01T04:30:00Z'}));assert.equal(statements.length,2);assert.match(statements[0].sql,/max\(hour\)/);assert.match(statements[1].sql,/UNION ALL/);
}
console.log('Chart materialized/live queries, ranking, hydration, numeric counts and hourly coverage boundary checks passed');
