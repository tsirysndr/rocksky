import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {getTableName} from 'drizzle-orm';
import {PgDialect} from 'drizzle-orm/pg-core';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='wrapped-test';
const W=await import('../output/Rocksky.Xrpc.App.Rocksky.Stats.GetWrapped/index.js');const Q=await import('../output/Rocksky.Xrpc.App.Rocksky.Stats.WrappedQuery/index.js');const {fromAff}=await import('../output/Control.Promise/index.js');const run=a=>fromAff(a)();const dialect=new PgDialect();const json=x=>JSON.parse(JSON.stringify(x));
const now=new Date('2026-05-31T12:34:56.789Z');
for(const period of ['year','3months','month','2weeks','week']){
 const w=W.periodWindow(now)(period)(2024);const expected=new Date(now);
 if(period==='year'){assert.equal(w.startDate.toISOString(),'2024-01-01T00:00:00.000Z');assert.equal(w.endDate.toISOString(),'2025-01-01T00:00:00.000Z');assert.equal(w.year,2024)}else{
  if(period==='month')expected.setUTCMonth(expected.getUTCMonth()-1);if(period==='3months')expected.setUTCMonth(expected.getUTCMonth()-3);if(period==='week')expected.setUTCDate(expected.getUTCDate()-7);if(period==='2weeks')expected.setUTCDate(expected.getUTCDate()-14);
  assert.equal(w.startDate.toISOString(),expected.toISOString());assert.equal(w.endDate.toISOString(),now.toISOString());assert.equal(w.year,2026);
 }
}
assert.equal(W.normalizePeriod('invalid'),'year');
for(const [dates,expected] of [[[],0],[['2024-02-28','2024-02-29','2024-03-01','2024-03-03'],3],[['2024-01-01','2024-01-01','2024-01-02'],2]])assert.equal(W.computeLongestStreak(dates)(),expected);
const w=W.periodWindow(now)('year')(2024);
const summary={totalScrobbles:'100',totalTime:'121000',newArtistsCount:'3',topTrackIds:[{trackId:null,playCount:10},{trackId:'b',playCount:'9'},{trackId:'a',playCount:8},{trackId:'missing',playCount:7}],topArtistIds:[{artistId:'r',playCount:'4'}],topAlbumIds:[{albumId:'l',playCount:3}],topGenres:[{genre:'',genre_count:90},{genre:'jazz',genre_count:'5'}],daily:[{date:'2024-02-28',dayCount:'2'},{date:'2024-02-29',dayCount:10},{date:'2024-03-01',dayCount:10}],hours:[{hour:'0',hourCount:4}],months:[{month:'2',monthCount:'12'}]};
const tracks=[{id:'a',title:'A',artist:'Artist',albumArt:null,uri:null},{id:'b',title:'B',artist:'Artist',uri:'at://b'}],artists=[{id:'r',name:'Artist',picture:null,uri:null}],albums=[{id:'l',title:'Album',artist:'Artist',albumArt:null,uri:'at://l'}];
const first=[{trackTitle:'A',artistName:'Artist',timestamp:now,trackUri:null}];
const out=json(W.presentation('year')(w)(summary)(first)([])(tracks)(artists)(albums)());
assert.deepEqual(out.topTracks.map(t=>t.id),['b','a']);assert.equal(out.topTracks[1].albumArt,undefined);assert.equal(out.topTracks[0].playCount,9);assert.equal(out.totalListeningTimeMinutes,2);assert.equal(out.totalScrobbles,100);assert.equal(out.newArtistsCount,3);assert.deepEqual(out.mostActiveDay,{date:'2024-02-29',count:10});assert.equal(out.mostActiveHour,0);assert.equal(out.longestStreak,3);assert.deepEqual(out.topGenres,[{genre:'jazz',count:5}]);assert.equal(out.firstScrobble.timestamp,now.toISOString());assert.equal(out.firstScrobble.trackUri,undefined);assert.equal(out.lastScrobble,undefined);
const q=dialect.sqlToQuery(Q.wrappedSummaryQuery('user')(w.startDate.toISOString())(w.endDate.toISOString()));assert.deepEqual(q.params,['user',w.startDate.toISOString(),w.endDate.toISOString(),'user',w.startDate.toISOString()]);assert.match(q.sql,/year_scrobbles AS MATERIALIZED/);assert.match(q.sql,/timestamp >=/);assert.match(q.sql,/timestamp </);assert.match(q.sql,/ORDER BY plays DESC, track_id LIMIT 5/);assert.match(q.sql,/name != 'Various Artists'/);
{
 const queries=[];const data={users:[{id:'user'}],scrobbles:first,tracks,artists,albums};const readDb={select(){let table;const b={from(t){table=getTableName(t);return b},innerJoin(){return b},where(c){queries.push({table,...dialect.sqlToQuery(c)});return b},orderBy(){return b},limit(){return b},execute(){return Promise.resolve(data[table])}};return b},execute(query){queries.push(dialect.sqlToQuery(query));return Promise.resolve({rows:[summary]})}};
 const result=json(await run(W.retrieve({readDb})({did:'test.bsky.social',year:2024,period:'year'})));assert.equal(result.totalScrobbles,100);assert.deepEqual(result.topTracks.map(t=>t.id),['b','a']);assert.deepEqual(queries[0].params,['test.bsky.social','test.bsky.social']);assert.equal(queries.filter(q=>q.table==='scrobbles').length,2);assert.ok(queries.some(q=>q.table==='tracks'&&q.params.join(',')==='b,a,missing'));
 data.users=[];const empty=json(await run(W.retrieve({readDb})({did:'missing',year:2024})));assert.equal(empty.totalScrobbles,0);assert.deepEqual(empty.topTracks,[]);assert.equal(empty.startDate,'2024-01-01T00:00:00.000Z');
}
console.log('Wrapped: UTC rolling month overflow, leap-year streaks, stable rankings, numeric aggregates, sparse output, SQL boundaries and replica hydration passed');
