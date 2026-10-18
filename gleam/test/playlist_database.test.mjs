import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { Credentials } from '../build/dev/javascript/rocksky_api/rocksky_api/node/xrpc_server.mjs';
import { Some, None } from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';
import { createTables } from './helpers/postgres.mjs';
import { register as playlists } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/playlist/get_playlists.mjs';
import { register as actorPlaylists } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/actor/get_actor_playlists.mjs';
import { register as playlist } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/playlist/get_playlist.mjs';

test('Playlist reads preserve same-track filters, cover order, canonical URI, track order and likes', {skip:!process.env.GLEAM_TEST_PGHOST}, async()=>{
  const client=new pg.Client({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres'});
  await client.connect();
  try {
    await createTables(client,['users','tracks','playlists','playlist_tracks','user_playlists','loved_tracks']);
    await client.query(`
      INSERT INTO users (xata_id,did,handle,display_name,avatar) VALUES ('u','did:test:u','u.test','User','avatar');
      INSERT INTO playlists (xata_id,name,uri,created_by,xata_createdat) VALUES
        ('p','Mix','at://did:test:u/app.rocksky.playlist/1','u','2024-01-01'),
        ('empty','Empty','at://did:test:u/app.rocksky.playlist/2','u','2024-01-02');
      INSERT INTO user_playlists (user_id,playlist_id) VALUES ('u','p'),('u','empty');
      INSERT INTO tracks (xata_id,title,artist,album_artist,album,duration,sha256,album_art) VALUES
        ('t1','One','A','A','First',100,'one','art1'),
        ('t2','Two','B','B','Second',200,'two','art2'),
        ('t3','Three','A','A','First',300,'three','art1');
      INSERT INTO playlist_tracks (playlist_id,track_id,added_at,xata_createdat) VALUES
        ('p','t1','2024-01-03','2024-01-01'),('p','t2','2024-01-01','2024-01-03'),('p','t3','2024-01-02','2024-01-02');
      INSERT INTO loved_tracks (track_id,user_id) VALUES ('t1','u');
    `);
    const methods=new Map(); const ctx={db:{pool:client},read_db:{pool:client}};
    for(const register of [playlists,actorPlaylists,playlist]) register({method:(n,c)=>methods.set(n,c)},ctx);
    const call=async(name,params,did)=>methods.get('app.rocksky.'+name).handler({params,auth:did?{credentials:new Credentials(new Some(did),new None(),new None())}:{}});
    const page=(await call('playlist.getPlaylists',{})).body.playlists;
    assert.deepEqual(page.map(p=>p.id),['empty','p']);
    assert.deepEqual(page[0].trackArts,[]); assert.equal(page[0].trackCount,0);
    assert.deepEqual(page[1].trackArts,['art1','art2']); assert.equal(page[1].trackCount,3); assert.equal(page[1].curatorDId,'did:test:u');
    for(const [method,base] of [['playlist.getPlaylists',{}],['actor.getActorPlaylists',{did:'u.test'}]]) {
      assert.deepEqual((await call(method,{...base,filter:'track.artist==A;track.album==Second'})).body.playlists,[]);
      assert.deepEqual((await call(method,{...base,filter:'track.artist==A;track.album==First'})).body.playlists.map(p=>p.id),['p']);
      assert.equal((await call(method,{...base,filter:'bogus==value'})).status,400);
    }
    assert.deepEqual((await call('actor.getActorPlaylists',{did:'missing'})).body.playlists,[]);
    const uri='at://u.test/app.rocksky.playlist/1';
    const detail=(await call('playlist.getPlaylist',{uri},'did:test:u')).body;
    assert.equal(detail.uri,'at://did:test:u/app.rocksky.playlist/1');
    assert.deepEqual(detail.tracks.map(t=>t.id),['t2','t3','t1']); assert.equal(detail.trackCount,3);
    assert.equal(detail.tracks[2].liked,true); assert.equal(detail.tracks[2].likesCount,1);
    const filtered=(await call('playlist.getPlaylist',{uri,filter:'addedAt=ge=2024-01-02;duration=lt=200'})).body;
    assert.deepEqual(filtered.tracks.map(t=>t.id),['t1']); assert.equal(filtered.trackCount,3);
    assert.equal((await call('playlist.getPlaylist',{uri,filter:'createdAt=ge=2024-01-01'})).status,400);
    assert.deepEqual((await call('playlist.getPlaylist',{uri:'at://unknown/app.rocksky.playlist/missing'})).body,{});
  } finally { await client.end(); }
});
