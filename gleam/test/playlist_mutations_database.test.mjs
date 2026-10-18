import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import axios from 'axios';
import { createTables } from './helpers/postgres.mjs';
import { Ok, toList } from '../build/dev/javascript/rocksky_api/gleam.mjs';
import { Some, None } from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';
import * as service from '../build/dev/javascript/rocksky_api/rocksky_api/playlists/service.mjs';
const cid='bafyreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku';
const did='did:plc:abcdefghijklmnopqrstuvwx',other='did:plc:zyxwvutsrqponmlkjihgfedcb';
const playlist=`at://${did}/app.rocksky.playlist/p`,song=`at://${other}/app.rocksky.song/t`;
test('Playlist writes preserve patches and ordered entry ownership without writing ingestion rows', {skip:!process.env.GLEAM_TEST_PGHOST}, async()=>{
 const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
 const originalFetch=globalThis.fetch,originalGet=axios.defaults.adapter;
 try {
  await createTables(pool,['playlists','playlist_tracks','tracks']);
  await pool.query("INSERT INTO playlists (xata_id,name,uri,created_by) VALUES ('p','Playlist',$1,'u')",[playlist]);
  await pool.query("INSERT INTO tracks (xata_id,title,artist,album_artist,album,duration,sha256,uri) VALUES ('t','Song','Artist','Artist','Album',100,'hash',$1)",[song]);
  await pool.query(`INSERT INTO playlist_tracks (playlist_id,track_id,uri,added_at) VALUES ('p','t',$1,'2026-01-01'),('p','t',$2,'2026-01-02'),('p','t',$3,'2026-01-03')`,[`at://${other}/app.rocksky.playlist.song/foreign`,`at://${did}/app.rocksky.playlist.song/own1`,`at://${did}/app.rocksky.playlist.song/own2`]);
  const ctx={db:{pool},env:{plc_directory_url:'https://plc.test'}};
  const writes=[],deletes=[];const current={$type:'app.rocksky.playlist',name:'Old',description:'Keep',createdAt:'2026-01-01T00:00:00.000Z',extra:{value:true}};
  const mock={did,com:{atproto:{repo:{getRecord:async()=>({data:{uri:playlist,cid,value:current}}),createRecord:async p=>{writes.push(p);return {data:{uri:`at://${did}/${p.collection}/${p.rkey}`,cid}};},putRecord:async p=>{writes.push(p);return {data:{uri:playlist,cid}};},deleteRecord:async p=>{deletes.push(p);}}}}};
  axios.defaults.adapter=async()=>({data:{service:[{id:did+'#atproto_pds',type:'AtprotoPersonalDataServer',serviceEndpoint:'https://pds.test'}]}});
  globalThis.fetch=async raw=>{const url=new URL(typeof raw==='string'?raw:raw.url??raw);assert.equal(url.host,'pds.test');return Response.json({uri:`at://${url.searchParams.get('repo')}/${url.searchParams.get('collection')}/${url.searchParams.get('rkey')}`,cid,value:{}});};
  const check=r=>assert.ok(r instanceof Ok,JSON.stringify(r));
  check(await service.create(mock,'New',new None(),new None()));assert.equal(writes[0].validate,false);
  check(await service.update(mock,did,playlist,new Some('Renamed'),new None(),new None()));
  assert.deepEqual(writes[1].record,{...current,name:'Renamed'});assert.equal(writes[1].rkey,'p');
  assert.ok(!((await service.add_songs(ctx,mock,other,playlist,toList([song]))) instanceof Ok));
  check(await service.add_songs(ctx,mock,did,playlist,toList([song])));assert.equal(writes[2].record.playlist.uri,playlist);assert.equal(writes[2].record.song.uri,song);
  assert.ok(!((await service.remove_track(ctx,mock,did,playlist,new Some(song),new Some(0))) instanceof Ok));
  assert.ok(!((await service.remove_track(ctx,mock,did,playlist,new Some('at://changed'),new Some(1))) instanceof Ok));
  assert.ok(!((await service.remove_track(ctx,mock,did,playlist,new None(),new Some(-1))) instanceof Ok));
  check(await service.remove_track(ctx,mock,did,playlist,new Some(song),new Some(1)));assert.deepEqual(deletes.map(p=>p.rkey),['own1']);
  check(await service.remove_track(ctx,mock,did,playlist,new Some(song),new None()));assert.deepEqual(deletes.map(p=>p.rkey),['own1','own1','own2']);
  check(await service.remove(ctx,mock,did,playlist));assert.deepEqual(deletes.slice(-3).map(p=>p.rkey),['own1','own2','p']);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM playlist_tracks')).rows[0].n,3);
 } finally {globalThis.fetch=originalFetch;axios.defaults.adapter=originalGet;await pool.end();}
});
