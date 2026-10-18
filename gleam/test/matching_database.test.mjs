import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import axios from 'axios';
import { createHash } from 'node:crypto';
import { createTables } from './helpers/postgres.mjs';
import { Ok } from '../build/dev/javascript/rocksky_api/gleam.mjs';
import { Some, None } from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';
import { parse } from '../build/dev/javascript/rocksky_api/rocksky_api/lib/track.mjs';
import * as matching from '../build/dev/javascript/rocksky_api/rocksky_api/lib/matching.mjs';
import { register } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/song/match_song.mjs';
const candidate={source:'spotify',id:'2XQSgmtEY2titXhfY414dy',title:'Song',artists:['Earth, Wind & Fire'],album:'Album',albumArtist:'Earth, Wind & Fire',durationMs:215000,albumArt:'https://provider.test/art',identifiers:{spotifyTrackId:'2XQSgmtEY2titXhfY414dy',isrc:'US1234567890'},providerScore:92.5,providerRank:4};
const hash=s=>createHash('sha256').update(s.toLowerCase()).digest('hex');
test('Matching preserves service policy and ranking while rejecting conflicting catalog identity', {skip:!process.env.GLEAM_TEST_PGHOST},async()=>{
 const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
 try {
  await createTables(pool,['tracks','albums','artists','user_tracks','scrobbles']);
  await pool.query("INSERT INTO tracks (xata_id,title,artist,album_artist,album,duration,sha256,uri,isrc) VALUES ('t','Song','Earth, Wind & Fire','Earth, Wind & Fire','Album',1,$1,'at://song','US1234567890')",[hash('song - earth, wind & fire - album')]);
  await pool.query("INSERT INTO albums (xata_id,title,artist,sha256,uri,album_art) VALUES ('al','Album','Earth, Wind & Fire',$1,'at://album','https://catalog.test/art')",[hash('album - earth, wind & fire')]);
  await pool.query("INSERT INTO artists (xata_id,name,sha256,uri) VALUES ('ar','Earth, Wind & Fire',$1,'at://artist')",[hash('earth, wind & fire')]);
  let body={policyVersion:'1',status:'matched',track:candidate,candidates:[{track:candidate}]},sent,calls=0;
  const ctx={db:{pool},read_db:{pool},matching:axios.create({adapter:async config=>{calls++;sent=JSON.parse(config.data);return {status:200,headers:{},data:body,config};}})};
  const track=parse({title:candidate.title,artist:candidate.artists[0],album:'Album',albumArtist:candidate.albumArtist,duration:215000,spotifyLink:'https://open.spotify.com/track/'+candidate.id+'?si=123'})[0];
  const request=matching.matching_request(track)[0];
  assert.ok((await matching.match_track(ctx,request,new None())) instanceof Ok);assert.deepEqual(sent.artists,['Earth, Wind & Fire']);assert.equal(sent.identifiers.spotifyTrackId,candidate.id);assert.equal(sent.durationMs,215000);
  const methods=new Map();register({method:(n,c)=>methods.set(n,c)},ctx);
  const call=async()=>methods.get('app.rocksky.song.matchSong').handler({params:{title:'Song',artist:candidate.artists[0],album:'Album'}});
  let response=(await call()).body;assert.equal(response.uri,'at://song');assert.equal(response.albumUri,'at://album');assert.equal(response.albumArt,'https://catalog.test/art');assert.equal(response.duration,215000);assert.equal(response.matches[0].score,93);assert.equal(response.matches[0].rank,4);
  await pool.query("UPDATE tracks SET isrc='OTHER'");response=(await call()).body;assert.equal(response.uri,null);assert.equal(response.albumUri,'at://album');assert.equal(response.id,'');
  body={policyVersion:'1',status:'ambiguous',track:null,candidates:[{track:candidate}]};assert.ok((await matching.match_track(ctx,request,new None()))[0] instanceof None);assert.equal((await call()).body.title,'Song');
  body={policyVersion:'1',status:'unmatched',track:null,candidates:[]};assert.deepEqual((await call()).body,{matches:[]});
  body={policyVersion:'1',status:'matched',track:null};assert.ok(!((await matching.match_track(ctx,request,new None())) instanceof Ok));
  const controller=new AbortController();controller.abort();const before=calls;assert.ok(!((await matching.match_track(ctx,request,new Some(controller.signal))) instanceof Ok));assert.equal(calls,before);
 } finally {await pool.end();}
});
