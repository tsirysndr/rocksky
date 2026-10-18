import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import jwt from 'jsonwebtoken';
const source = await readFile(new URL('../api/src/Rocksky/Lib/Env.purs', import.meta.url), 'utf8');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt';
for (const [, key] of source.matchAll(/"([A-Z0-9_]+)": str required/g)) process.env[key] = 'import-test';
const P = await import('../output/Rocksky.Import.Parser/index.js');
const S = await import('../output/Rocksky.Import.Service/index.js');
const App = await import('../output/Rocksky.Import.App/index.js');
const { fromAff, toAffE } = await import('../output/Control.Promise/index.js');
const { Just, Nothing } = await import('../output/Data.Maybe/index.js');
const run = aff => fromAff(aff)();
assert.deepEqual(P.parseCSVLine(' "a,b", "quote ""inside""", plain '), ['a,b', 'quote "inside"', 'plain']);
const csv = '\ufeffuts,utc_time,artist,artist_mbid,album,album_mbid,track,track_mbid\n1700000000junk,,"Artist, One",,,,Song,mbid\n0,,A,,B,,C,\n-1,,A,,B,,C,\n4294967296,,A,,B,,C,';
const tracks = P.parseLastfmCsv(csv);
assert.equal(tracks.length, 3);
assert.equal(tracks[0].album, 'Unknown Album');
assert.equal(tracks[0].artist, 'Artist, One');
assert.equal(tracks[0].mbId, 'mbid');
assert.equal(tracks[2].timestamp, 4294967296);
assert.equal(P.parseLastfmCsv('uts,track,artist,x,album,y,z\n12,Song,Artist,,Album,,')[0].title, 'Song');
const basic = { trackName:'Song', artistName:'Artist', msPlayed:30000, endTime:'2024-01-02 03:04' };
const extended = { master_metadata_track_name:'Song', master_metadata_album_artist_name:'Artist', ms_played:30000, ts:'2024-01-02T03:04:00Z', spotify_track_uri:'spotify:track:id' };
const parsed = P.parseSpotifyJson([basic, extended, {...basic,msPlayed:29999}, {...extended,ts:null}, {...basic,endTime:undefined}])();
assert.equal(parsed.length, 2);
assert.equal(parsed[0].timestamp, Date.parse('2024-01-02T03:04:00Z')/1000);
assert.equal(parsed[1].spotifyLink, 'https://open.spotify.com/track/id');
assert.equal(P.parseSpotifyJson([{...extended,ts:undefined}])().length, 1);
assert.throws(() => P.parseSpotifyJson([null])(), /in.*operator/);
const user={id:'u',did:'did:plc:listener'};
const job={id:'job',status:'running',updatedAt:new Date(),createdAt:new Date()};
function context(responses) {
  const writes=[], limits=[], offsets=[];
  const ctx={db:{
    select(){const q={};for(const k of ['from','where','orderBy'])q[k]=()=>q;
      q.limit=n=>{limits.push(n);return q};q.offset=n=>{offsets.push(n);return q};
      q.execute=async()=>{assert.ok(responses.length,'Unexpected read');const r=responses.shift();if(r instanceof Error)throw r;return r};return q;},
    update(){const q={set(v){writes.push(v);return q},where(){return q},async execute(){}};return q},
    insert(){const q={values(v){writes.push(v);return q},returning(){return q},async execute(){return [job]}};return q},
  }};
  return {ctx,writes,limits,offsets,done(){assert.equal(responses.length,0)}};
}
const dep = (fn, agent={}) => ({agent:()=>toAffE(async()=>agent===null?Nothing.value:new Just(agent)),scrobble:t=>a=>d=>cache=>toAffE(()=>fn(t,cache)),pause:toAffE(async()=>{})});
{
  const m=context([[user],[{timestamp:new Date(1000)}],[{status:'running'}]]),state=S.newState();
  let active=0,maxActive=0;const caches=[], seen=[];
  const inputs=Array.from({length:8},(_,i)=>({...tracks[0],title:'T'+i,timestamp:i+1}));
  await run(S.runWith(m.ctx)(dep(async(t,cache)=>{active++;maxActive=Math.max(active,maxActive);caches.push(cache);seen.push(t.title);await new Promise(r=>setTimeout(r,5));active--;if(t.title==='T3')throw Error('nope')}))(state)('job')(inputs)(user.did));
  assert.equal(maxActive,3);assert.equal(new Set(caches).size,1);assert.ok(!seen.includes('T0'));
  assert.equal(m.writes[0].total,7);assert.equal(m.writes.at(-1).status,'completed');assert.equal(m.writes.at(-1).processed,6);assert.equal(m.writes.at(-1).failed,1);assert.match(m.writes.at(-1).errors,/T3 - Artist, One: nope/);m.done();
}
{
  const m=context([[user],[],[{status:'cancelled'}]]),state=S.newState();let calls=0;
  await run(S.runWith(m.ctx)(dep(async()=>{calls++}))(state)('job')(Array.from({length:9},()=>tracks[0]))(user.did));
  assert.equal(calls,3);assert.ok(!m.writes.some(w=>w.status==='completed'));m.done();
}
{
  const m=context([]);await run(S.runWith(m.ctx)(dep(async()=>{},null))(S.newState())('job')([])(user.did));
  assert.equal(m.writes[0].status,'failed');assert.match(m.writes[0].errors,/Authentication failed/);
}
{
  const inputs=Array.from({length:55},(_,i)=>({...tracks[0],title:'bad'+i}));
  const m=context([[user],[],...Array.from({length:4},()=>[{status:'running'}])]);
  await run(S.runWith(m.ctx)(dep(async()=>{throw Error('bad')}))(S.newState())('job')(inputs)(user.did));
  assert.equal(m.writes.at(-1).failed,55);assert.equal(JSON.parse(m.writes.at(-1).errors).length,50);m.done();
}
const authorization='Bearer '+jwt.sign({did:user.did},process.env.JWT_SECRET);
const request=(app,path,method='GET',body)=>app.request('http://localhost'+path,{method,headers:{authorization},body});
{
 const app=App.app(context([]).ctx)();
 for(const [path,method] of [['/status','GET'],['/jobs','GET'],['/upload','POST'],['/cancel','POST'],['/events','GET']])assert.equal((await app.request('http://localhost'+path,{method})).status,401);
}
{
 const m=context([new Error('db unavailable')]);assert.equal((await request(App.app(m.ctx)(),'/status')).status,401);m.done();
}
{
 const m=context([[user],[job]]);assert.equal((await request(App.app(m.ctx)(),'/upload','POST')).status,409);m.done();
}
{
 const m=context([[user],[{...job,updatedAt:new Date(0)}]]);assert.equal((await request(App.app(m.ctx)(),'/upload','POST')).status,400);assert.equal(m.writes[0].status,'failed');m.done();
}
{
 const m=context([[user],[job],[user],[job]]),app=App.app(m.ctx)();
 assert.deepEqual(await (await request(app,'/cancel','POST')).json(),{ok:true});
 const status=await (await request(app,'/status')).json();assert.equal(status.currentTrack,null);assert.equal(m.writes[0].status,'cancelled');m.done();
}
{
 const m=context([[user],[{...job,status:'completed'}]]),app=App.app(m.ctx)();
 const result=await app.request('http://localhost/events?token='+authorization.slice(7));assert.equal(result.status,200);assert.match(await result.text(),/event: progress\ndata: .*"status":"completed"/);m.done();
}
{
 const m=context([[user],[]]),app=App.app(m.ctx)();const form=new FormData();form.set('type','spotify');form.set('file',new Blob(['{bad']), 'history.json');
 const result=await request(app,'/upload','POST',form);assert.equal(result.status,400);assert.match((await result.json()).error,/Failed to parse file:/);m.done();
}
{
 const m=context([[user],[]]);await request(App.app(m.ctx)(),'/jobs?size=0x10&offset=2.5');assert.equal(m.limits.at(-1),16);assert.equal(m.offsets.at(-1),2.5);m.done();
}
console.log('Import parsers, concurrency, cache, deduplication, failures, cancellation, authentication, multipart and SSE checks passed');
