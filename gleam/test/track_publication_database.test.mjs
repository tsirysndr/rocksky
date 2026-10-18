import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { createHash } from 'node:crypto';
import { createTables } from './helpers/postgres.mjs';
import { Ok } from '../build/dev/javascript/rocksky_api/gleam.mjs';
import { Some, None } from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';
import { parse } from '../build/dev/javascript/rocksky_api/rocksky_api/lib/track.mjs';
import { save_track } from '../build/dev/javascript/rocksky_api/rocksky_api/tracks/service.mjs';
import { put_scrobble_record } from '../build/dev/javascript/rocksky_api/rocksky_api/nowplaying/records.mjs';
import { put_record_once } from '../build/dev/javascript/rocksky_api/rocksky_api/lib/record_ownership.mjs';
const did='did:plc:abcdefghijklmnopqrstuvwx';
const hash=s=>createHash('sha256').update(s.toLowerCase()).digest('hex');
test('Catalog publication links exact identities, preserves art, and uses durable create-only scrobbles', {skip:!process.env.GLEAM_TEST_PGHOST},async()=>{
 const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
 try {
  await createTables(pool,['tracks','albums','artists','album_tracks','artist_tracks','artist_albums']);
  const track={title:'Song',artist:'Artist',albumArtist:'Artist',album:'Album',duration:100,trackNumber:0,discNumber:0,timestamp:1700000000};
  const parsed=parse(track);assert.ok(parsed instanceof Ok);const value=parsed[0];
  await pool.query("INSERT INTO tracks (xata_id,title,artist,album_artist,album,duration,sha256,album_art) VALUES ('t','Song','Artist','Artist','Album',100,$1,'https://art.test/known')",[hash('song - artist - album')]);
  const writes=[],messages=[];
  const mock={did,com:{atproto:{repo:{putRecord:async p=>{
    writes.push(p);const uri=`at://${did}/${p.collection}/${p.rkey}`;
    if(p.collection==='app.rocksky.song')await pool.query("UPDATE tracks SET uri=$1 WHERE xata_id='t'",[uri]);
    if(p.collection==='app.rocksky.artist')await pool.query("INSERT INTO artists (xata_id,name,sha256,uri) VALUES ('ar','Artist',$1,$2)",[hash('artist'),uri]);
    if(p.collection==='app.rocksky.album')await pool.query("INSERT INTO albums (xata_id,title,artist,sha256,uri) VALUES ('al','Album','Artist',$1,$2)",[hash('album - artist'),uri]);
    return {data:{uri,cid:'cid'}};
  }}}}};
  const ctx={db:{pool},nc:{publish:(topic,data)=>messages.push({topic,data:JSON.parse(Buffer.from(data).toString())})}};
  const result=await save_track(ctx,value,mock);assert.ok(result instanceof Ok,JSON.stringify(result));
  assert.equal(writes.length,3);assert.equal(writes[0].record.albumArtUrl,'https://art.test/known');assert.equal(writes[0].record.trackNumber,1);
  assert.equal(messages.length,1);assert.equal(messages[0].topic,'rocksky.track');
  assert.equal(messages[0].data.album_track.track_id.xata_id,'t');assert.equal(messages[0].data.track.sha256,hash('song - artist - album'));
  assert.ok((await save_track(ctx,value,mock)) instanceof Ok);assert.equal(writes.length,3);
  assert.ok((await put_scrobble_record(value,mock,new Some('3lxyzxyzxyz22'))) instanceof Ok);
  assert.equal(writes.at(-1).swapRecord,null);assert.equal(writes.at(-1).record.createdAt,'2023-11-14T22:13:20.000Z');
  mock.com.atproto.repo.putRecord=async()=>{throw new Error('lost response');};
  mock.com.atproto.repo.getRecord=async p=>({data:{uri:`at://${did}/${p.collection}/${p.rkey}`,cid:'cid',value:{}}});
  const recovered=await put_scrobble_record(value,mock,new Some('3lxyzxyzxyz22'));assert.ok(recovered instanceof Ok);assert.ok(recovered[0] instanceof Some);
 } finally {await pool.end();}
});

test('Publication claims serialize concurrent puts and release failed or empty outcomes',async()=>{
 const claims=new Set();let count=0;
 const redis={set:async(key,value,options)=>{assert.equal(options.EX,900);assert.equal(options.NX,true);if(claims.has(key))return null;claims.add(key);return 'OK';},del:async(keys)=>{keys.forEach(k=>claims.delete(k));return 1;}};
 const call=put=>put_record_once(redis,did,'app.rocksky.song','hash',put);
 const put=async()=>{count++;return new Ok(new Some('at://record'));};
 await Promise.all([call(put),call(put)]);assert.equal(count,1);
 claims.clear();await call(async()=>new Ok(new None()));assert.equal(claims.size,0);
 await call(put);assert.equal(count,2);
});
