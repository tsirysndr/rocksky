import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from '@atproto/xrpc-server';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');
process.env.NODE_ENV='test';
for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='spotify-test';
Object.assign(process.env,{SPOTIFY_ENCRYPTION_KEY:'ab'.repeat(32),SPOTIFY_ENCRYPTION_IV:'cd'.repeat(16),SPOTIFY_API_URL:'https://spotify.example.test/v1'});
const {fromAff}=await import('../output/Control.Promise/index.js');
const {Just}=await import('../output/Data.Maybe/index.js');
const Crypto=await import('../output/Rocksky.Lib.Crypto/index.js');
const Control=await import('../output/Rocksky.Xrpc.App.Rocksky.Spotify.Control/index.js');
const Current=await import('../output/Rocksky.Xrpc.App.Rocksky.Spotify.GetCurrentlyPlaying/index.js');
const {loadLexicons}=await import('../output/Rocksky.Lexicon/index.js');
const run=aff=>fromAff(aff)();
const encrypt=s=>Crypto.encrypt(s)(process.env.SPOTIFY_ENCRYPTION_KEY)();
function db(responses){return {select(){const q={};for(const name of ['from','where','leftJoin'])q[name]=()=>q;q.execute=async()=>{assert.ok(responses.length,'unexpected query');return responses.shift()};return q}};}
const requests=[],originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{requests.push({url:String(url),options});return String(url).includes('/api/token')?Response.json({access_token:'fresh'}):new Response(null,{status:204});};
try{
 for(const action of ['play','pause','next','previous','seek']){
  const responses=[[{id:'user'}],[{token:{refreshToken:encrypt('refresh')},app:{spotifySecret:encrypt('secret'),spotifyAppId:'client'}}]];
  await run(Control.control({db:db(responses)})(new Just('did:plc:listener'))(action)(action==='seek'?'?position_ms=1234':''));
  assert.equal(responses.length,0);const tokenRequest=requests.at(-2),command=requests.at(-1);
  const form=new URLSearchParams(tokenRequest.options.body);assert.equal(form.get('refresh_token'),'refresh');assert.equal(form.get('client_secret'),'secret');
  assert.equal(command.options.headers.Authorization,'Bearer fresh');assert.equal(command.options.method,['next','previous'].includes(action)?'POST':'PUT');assert.ok(command.url.endsWith(action+(action==='seek'?'?position_ms=1234':'')));
 }
 const server=createServer(await run(loadLexicons)),methods=new Map();server.method=(nsid,config)=>{methods.set(nsid,config);return server};
 for(const action of ['Play','Pause','Next','Previous','Seek']){
  const mod=await import('../output/Rocksky.Xrpc.App.Rocksky.Spotify.'+action+'/index.js');mod.register(server)({authVerifier:()=>{},db:db([[{id:"u"}],[{token:{refreshToken:"bad"},app:{spotifySecret:"bad",spotifyAppId:"client"}}]])})();
  const result=await methods.get('app.rocksky.spotify.'+action[0].toLowerCase()+action.slice(1)).handler({params:{position:12},auth:{credentials:{did:'did:plc:listener'}}});assert.equal(result,undefined,'source returns no content on swallowed failure');
 }
}finally{globalThis.fetch=originalFetch}
{
 const user={xata_id:'user',did:'did:plc:actor',handle:'actor.test'},track={xata_id:'track',uri:'song-uri',artist_uri:'artist-uri',album_uri:null};
 const queries=[];let releases=0;
 const client={release(){releases++},async query(config,params){const text=config.text;queries.push({text,params});
  const data=text.includes('from "loved_tracks"')?{xata_id:'like'}:text.includes('from "tracks"')?track:user;
  const columns=text.split(' from ')[0].slice(7).split(', ');
  return {rows:[columns.map(column=>data[[...column.matchAll(/"([^"]+)"/g)].at(-1)[1]]??null)]};
 }};
 const cached={item:{name:'Song',artists:[{name:'Artist'}],album:{name:'Album'}},progress_ms:12};
 const ctx={pools:{pool:{async connect(){return client}}},db:db([[{account:{email:'actor@example.test'}}]]),redis:{async get(key){assert.equal(key,'actor@example.test:current');return JSON.stringify(cached)}}};
 const result=await run(Current.retrieve(ctx)(new Just('actor.test'))(new Just('did:plc:viewer')));
 assert.equal(result.songUri,'song-uri');assert.equal(result.artistUri,'artist-uri');assert.equal(result.albumUri,null);assert.equal(result.liked,true);assert.equal(result.sha256,undefined);assert.equal(releases,2);
 assert.ok(queries[0].params.includes('actor.test'));assert.ok(queries.at(-1).params.includes('did:plc:actor'),'likes belong to selected actor');
}
console.log('Spotify XRPC token refresh, playback methods, no-content fallback and actor URI/likes checks passed');
