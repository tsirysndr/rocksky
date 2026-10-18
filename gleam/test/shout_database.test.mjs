import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { createTables } from './helpers/postgres.mjs';
import { Credentials } from '../build/dev/javascript/rocksky_api/rocksky_api/node/xrpc_server.mjs';
import { Some, None } from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';
import { register as album } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/shout/get_album_shouts.mjs';
import { register as artist } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/shout/get_artist_shouts.mjs';
import { register as track } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/shout/get_track_shouts.mjs';
import { register as profile } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/shout/get_profile_shouts.mjs';
import { register as replies } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/shout/get_shout_replies.mjs';
import { register as report } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/shout/report_shout.mjs';

test('Shout reads preserve order, authors, likes, profile reports and id-or-URI report deduplication', {skip:!process.env.GLEAM_TEST_PGHOST}, async()=>{
  const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
  try {
    await createTables(pool,['users','artists','albums','tracks','shouts','profile_shouts','shout_likes','shout_reports']);
    await pool.query(`
      INSERT INTO users (xata_id,did,handle,display_name,avatar) VALUES ('u','did:test:u','u.test','User','avatar'),('v','did:test:v','v.test','Visitor','');
      INSERT INTO artists (xata_id,name,sha256,uri) VALUES ('a','Artist','a','at://artist');
      INSERT INTO albums (xata_id,title,artist,sha256,uri) VALUES ('al','Album','Artist','al','at://album');
      INSERT INTO tracks (xata_id,title,artist,album_artist,album,duration,sha256,uri) VALUES ('t','Track','Artist','Artist','Album',100,'t','at://track');
      INSERT INTO shouts (xata_id,content,uri,author_id,track_id,artist_id,album_id,parent_id,xata_createdat) VALUES
        ('s1','First','at://s1','u','t','a','al',NULL,'2024-01-01'),('s2','Reply','at://s2','v','t','a','al','at://s1','2024-01-02');
      INSERT INTO profile_shouts (user_id,shout_id,xata_createdat) VALUES ('u','s1','2024-01-03'),('u','s2','2024-01-04');
      INSERT INTO shout_likes (user_id,shout_id,uri) VALUES ('u','s1','at://like1'),('v','s1','at://like2');
    `);
    const methods=new Map();const ctx={db:{pool},read_db:{pool}};
    for(const register of [album,artist,track,profile,replies,report]) register({method:(n,c)=>methods.set(n,c)},ctx);
    const call=async(name,params={},input,did)=>methods.get('app.rocksky.shout.'+name).handler({params,input:input?{body:input}:undefined,auth:did?{credentials:new Credentials(new Some(did),new None(),new None())}:{}});
    for(const [method,uri] of [['getAlbumShouts','at://album'],['getArtistShouts','at://artist']]) {
      const shouts=(await call(method,{uri},undefined,'did:test:u')).body.shouts;
      assert.deepEqual(shouts.map(s=>s.id),['s2','s1']); assert.equal(shouts[1].likes,2); assert.equal(shouts[1].liked,true);
      assert.equal(shouts[0].author.handle,'v.test'); assert.equal(shouts[1].parent,null);
      assert.equal((await call(method,{uri})).body.shouts[1].liked,undefined);
    }
    // The legacy track endpoint ignores caller auth when computing liked.
    assert.equal((await call('getTrackShouts',{uri:'at://track'},undefined,'did:test:u')).body.shouts[1].liked,undefined);
    const reply=(await call('getShoutReplies',{uri:'at://s1'})).body.shouts;
    assert.deepEqual(reply.map(s=>s.id),['s2']); assert.equal(reply[0].likes,undefined);
    assert.deepEqual((await call('reportShout',{}, {shoutId:'at://s1'},'did:test:u')).body,{});
    assert.deepEqual((await call('reportShout',{}, {shoutId:'s1'},'did:test:u')).body,{});
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM shout_reports')).rows[0].n,1);
    const comments=(await call('getProfileShouts',{did:'u.test'})).body.shouts;
    assert.equal(comments[1].reported,true); assert.equal(comments[1].liked,true); assert.equal(comments[0].reported,false);
    await call('reportShout',{}, {shoutId:'s2'});
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM shout_reports')).rows[0].n,1);
  } finally { await pool.end(); }
});
