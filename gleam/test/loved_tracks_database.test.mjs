import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import axios from 'axios';
import { createHash } from 'node:crypto';
import { createTables } from './helpers/postgres.mjs';
import { Ok } from '../build/dev/javascript/rocksky_api/gleam.mjs';
import { parse } from '../build/dev/javascript/rocksky_api/rocksky_api/lib/track.mjs';
import * as service from '../build/dev/javascript/rocksky_api/rocksky_api/lovedtracks/service.mjs';
const cid='bafyreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku';
const did='did:plc:abcdefghijklmnopqrstuvwx',owner='did:plc:zyxwvutsrqponmlkjihgfedcb';
test('Track likes publish PDS records, leave ingestion-owned rows intact, and remove legacy likes locally', {skip:!process.env.GLEAM_TEST_PGHOST},async()=>{
 const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
 const adapter=axios.defaults.adapter,originalFetch=globalThis.fetch;
 try {
  await createTables(pool,['users','tracks','artists','albums','album_tracks','artist_tracks','artist_albums','loved_tracks','notifications','shouts','scrobbles']);
  await pool.query("INSERT INTO users (xata_id,did,handle,display_name,avatar) VALUES ('u',$1,'u.test','User',''),('v',$2,'v.test','Owner','')",[did,owner]);
  const uri=`at://${owner}/app.rocksky.song/song`,hash=createHash('sha256').update('song - artist - album').digest('hex');
  await pool.query("INSERT INTO tracks (xata_id,title,artist,album_artist,album,duration,sha256,uri,mb_id) VALUES ('t','Song','Artist','Artist','Album',100,$1,$2,'keep')",[hash,uri]);
  const messages=[],writes=[],deletes=[];
  const ctx={db:{pool},env:{plc_directory_url:'https://plc.test'},nc:{publish:(topic,data)=>messages.push({topic,data:JSON.parse(Buffer.from(data).toString())})}};
  const mock={did,com:{atproto:{repo:{createRecord:async p=>{writes.push(p);return {data:{uri:`at://${did}/app.rocksky.like/like`,cid}};},deleteRecord:async p=>{deletes.push(p);}}}}};
  axios.defaults.adapter=async()=>({status:200,headers:{},data:{service:[{id:owner+'#atproto_pds',type:'AtprotoPersonalDataServer',serviceEndpoint:'https://pds.test'}]}});
  globalThis.fetch=async raw=>{const url=new URL(typeof raw==='string'?raw:raw.url??raw);assert.equal(url.host,'pds.test');return Response.json({uri,cid,value:{}});};
  const track=parse({title:'Song',artist:'Artist',album:'Album',albumArtist:'Artist',duration:200})[0];
  const liked=await service.like_track(ctx,track,'u',mock);assert.ok(liked instanceof Ok,JSON.stringify(liked));
  assert.equal(writes[0].record.subject.uri,uri);assert.equal((await pool.query('SELECT count(*)::int AS n FROM loved_tracks')).rows[0].n,0);
  assert.equal((await pool.query('SELECT mb_id,duration FROM tracks')).rows[0].mb_id,'keep');assert.equal((await pool.query('SELECT count(*)::int AS n FROM album_tracks')).rows[0].n,1);
  assert.equal((await pool.query('SELECT type FROM notifications')).rows[0].type,'like_scrobble');
  await pool.query("INSERT INTO loved_tracks (xata_id,track_id,user_id,uri) VALUES ('l','t','u',$1)",[`at://${did}/app.rocksky.like/like`]);
  assert.ok((await service.unlike_track(ctx,hash,'u',mock)) instanceof Ok);assert.equal(deletes[0].rkey,'like');assert.equal((await pool.query('SELECT count(*)::int AS n FROM loved_tracks')).rows[0].n,1);
  const listed=await service.get_loved_tracks(ctx,'u',10,0);assert.ok(listed instanceof Ok);assert.equal(listed[0].toArray()[0].id,'t');
  await pool.query("UPDATE loved_tracks SET uri=NULL");assert.ok((await service.unlike_track(ctx,hash,'u',mock)) instanceof Ok);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM loved_tracks')).rows[0].n,0);assert.equal(messages.at(-1).topic,'rocksky.unlike');assert.equal(messages.at(-1).data.track_id.xata_id,'t');
 } finally {axios.defaults.adapter=adapter;globalThis.fetch=originalFetch;await pool.end();}
});
