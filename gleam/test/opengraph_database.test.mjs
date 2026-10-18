import assert from 'node:assert/strict';
import {test} from 'node:test';
import pg from 'pg';
import {createTables} from './helpers/postgres.mjs';
import {app} from '../build/dev/javascript/rocksky_api/rocksky_api/opengraph/app.mjs';
test('OpenGraph resolves profile and record metadata with source status and null semantics',{skip:!process.env.GLEAM_TEST_PGHOST},async()=>{
 const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
 try{
 await createTables(pool,['users','albums','artists','tracks','scrobbles']);
 await pool.query("INSERT INTO users(xata_id,did,handle,display_name,avatar) VALUES ('u','did:plc:u','u.test','U','https://cdn/@jpeg')");
 await pool.query("INSERT INTO artists(xata_id,name,sha256,uri) VALUES ('a','Artist','a','at://did:plc:u/app.rocksky.artist/a')");
 await pool.query("INSERT INTO albums(xata_id,title,artist,sha256,uri) VALUES ('al','Album','Artist','al','at://did:plc:u/app.rocksky.album/al')");
 await pool.query("INSERT INTO tracks(xata_id,title,artist,album_artist,sha256,duration,album,uri) VALUES ('t','Track','Artist','Artist','t',1000,'Album','at://did:plc:u/app.rocksky.song/t')");
 await pool.query("INSERT INTO scrobbles(user_id,track_id,artist_id,album_id,uri,timestamp) VALUES ('u','t','a','al','at://did:plc:u/app.rocksky.scrobble/s',now())");
 const api=app({read_db:{pool}});const get=path=>api.request('/?path='+encodeURIComponent(path));
 assert.equal((await api.request('/')).status,400);assert.equal((await get('/unsupported')).status,400);assert.equal((await get('/profile/missing')).status,404);
 let r=await get('/profile/u%2Etest');let data=await r.json();assert.equal(data.title,'@u.test on Rocksky');assert.ok(!('image'in data));
 for(const [kind,key,title] of [['artist','a','Artist: Artist'],['album','al','Album: Album by Artist'],['song','t','Track: Track by Artist'],['scrobble','s','Scrobble: Track by Artist']]){r=await get(`/did:plc:u/${kind}/${key}`);assert.equal(r.status,200);data=await r.json();assert.equal(data.title,title);assert.equal(data.image,null);assert.equal(data.twitterCard,'summary_large_image');}
 assert.equal((await get('/did:plc:u/song/missing')).status,404);
 }finally{await pool.end();}
});
