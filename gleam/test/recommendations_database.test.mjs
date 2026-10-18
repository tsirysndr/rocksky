import assert from 'node:assert/strict';
import {test} from 'node:test';
import pg from 'pg';
import {createTables} from './helpers/postgres.mjs';
import {Ok} from '../build/dev/javascript/rocksky_api/gleam.mjs';
import {describe} from '../build/dev/javascript/rocksky_api/rocksky_api/error.mjs';
import {encode_feed_recommended_artists_view as encode} from '../build/dev/javascript/rocksky_api/rocksky_api/lexicon/models.mjs';
import {retrieve} from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/feed/get_artist_recommendations.mjs';
test('Artist recommendations weight neighbour plays, exclude heard artists and constrain serendipity genres',{skip:!process.env.GLEAM_TEST_PGHOST},async()=>{
 const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
 try {
 await createTables(pool,['users','user_artists','artists','tracks','loved_tracks','scrobbles']);
 await pool.query("INSERT INTO users(xata_id,did,handle,display_name,avatar) VALUES ('u','did:u','u.test','U',''),('n','did:n','n.test','N',''),('empty','did:empty','empty.test','Empty','')");
 await pool.query("INSERT INTO artists(xata_id,name,sha256,uri,genres) VALUES ('heard','Heard','heard','at://heard',ARRAY['rock']),('candidate','Candidate','candidate','at://candidate',ARRAY['rock']),('tail','Tail','tail','at://tail',ARRAY['rock']),('supplement','Supplement','supplement','at://supplement',ARRAY['rock']),('wrong','Wrong','wrong','at://wrong',ARRAY['jazz']),('various','Various Artists','various','at://various',ARRAY['rock'])");
 await pool.query("INSERT INTO user_artists(user_id,artist_id,uri,scrobbles) VALUES ('u','heard','at://heard',100)");
 await pool.query("INSERT INTO scrobbles(user_id,artist_id,timestamp) VALUES ('n','heard',now()),('n','candidate',now()),('n','candidate',now()),('n','tail',now()),('n','wrong',now()),('n','various',now())");
 const ctx={db:{pool},read_db:{pool}};
 let result=await retrieve(ctx,'u.test',4);assert.ok(result instanceof Ok,result instanceof Ok?'':describe(result[0]));
 const rows=encode(result[0]).artists;
 assert.equal(rows[0].id,'candidate');assert.equal(rows[0].source,'neighbour');assert.ok(rows[0].recommendationScore>1.9);
 assert.ok(rows.every(r=>!['heard','wrong','various'].includes(r.id)));assert.ok(rows.every(r=>r.genres.includes('rock')));
 assert.ok(rows.some(r=>r.id==='supplement'&&r.source==='serendipity'));
 result=await retrieve(ctx,'did:empty',50);assert.ok(result instanceof Ok);assert.deepEqual(encode(result[0]).artists,[]);
 result=await retrieve(ctx,'missing',50);assert.ok(!(result instanceof Ok));
 await pool.query("DELETE FROM scrobbles");result=await retrieve(ctx,'did:u',4);assert.deepEqual(encode(result[0]).artists,[]);
 } finally {await pool.end();}
});

test('Album and song recommendations exclude listening history, boost social likes and diversify artists',{skip:!process.env.GLEAM_TEST_PGHOST},async()=>{
 const {retrieve:albums}=await import('../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/feed/get_album_recommendations.mjs');
 const {retrieve:songs}=await import('../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/feed/get_recommendations.mjs');
 const {encode_feed_recommended_albums_view:encodeAlbums,encode_feed_recommendations_view:encodeSongs}=await import('../build/dev/javascript/rocksky_api/rocksky_api/lexicon/models.mjs');
 const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
 try {
 await createTables(pool,['users','user_artists','artists','albums','tracks','loved_tracks','scrobbles']);
 await pool.query("INSERT INTO users(xata_id,did,handle,display_name,avatar) VALUES ('u','did:u','u.test','U',''),('n','did:n','n.test','N','')");
 await pool.query("INSERT INTO artists(xata_id,name,sha256,uri,genres) VALUES ('known','Known','known','at://known',ARRAY['rock']),('a','A','a','at://a',ARRAY['rock']),('b','B','b','at://b',ARRAY['rock']),('wrong','Wrong','wrong','at://wrong',ARRAY['jazz'])");
 await pool.query("INSERT INTO albums(xata_id,title,artist,sha256,uri,artist_uri,year) VALUES ('heard','Heard','Known','heard','at://heard','at://known',2020),('new','New','Known','new','at://new','at://known',2021),('a-album','A Album','A','a-album','at://a-album','at://a',2022),('wrong-album','Wrong','Wrong','wrong-album','at://wrong-album','at://wrong',2023)");
 await pool.query("INSERT INTO tracks(xata_id,title,artist,album,album_artist,sha256,duration,uri,artist_uri,album_uri) VALUES ('heard','Heard','Known','Heard','Known','heard',1000,'at://heard-song','at://known','at://heard'),('a1','A1','A','A Album','A','a1',1000,'at://a1','at://a','at://a-album'),('a2','A2','A','A Album','A','a2',1000,'at://a2','at://a','at://a-album'),('b1','B1','B','B Album','B','b1',1000,'at://b1','at://b',NULL),('wrong','Wrong','Wrong','Wrong','Wrong','wrong',1000,'at://wrong-song','at://wrong','at://wrong-album'),('loved','Loved','Known','New','Known','loved',1000,'at://loved','at://known','at://new')");
 await pool.query("INSERT INTO user_artists(user_id,artist_id,uri,scrobbles) VALUES ('u','known','at://known',100)");
 await pool.query("INSERT INTO scrobbles(user_id,artist_id,track_id,timestamp) VALUES ('u','known','heard',now()),('n','known','heard',now()),('n','a','a1',now()),('n','a','a2',now()),('n','b','b1',now()),('n','wrong','wrong',now())");
 await pool.query("INSERT INTO loved_tracks(user_id,track_id) VALUES ('u','loved'),('n','a1'),('n','a2'),('n','wrong')");
 const ctx={db:{pool},read_db:{pool}};
 let result=await albums(ctx,'did:u',20);assert.ok(result instanceof Ok,result instanceof Ok?'':describe(result[0]));let view=encodeAlbums(result[0]);
 assert.deepEqual(view.albums.map(a=>a.id),['new','a-album']);assert.equal(view.albums[0].source,'known-artist');assert.equal(view.albums[0].recommendationScore,100);assert.equal(view.albums[1].source,'new-artist');
 result=await songs(ctx,'did:u',4);assert.ok(result instanceof Ok,result instanceof Ok?'':describe(result[0]));view=encodeSongs(result[0]);
 assert.equal(view.recommendations.length,3);assert.equal(view.recommendations[0].source,'social');assert.equal(view.recommendations[0].likesCount,1);assert.ok(view.recommendations[0].recommendationScore>4.9);
 assert.equal(view.recommendations[1].artist,'B');assert.equal(view.recommendations[2].artist,'A');assert.ok(view.recommendations.every(s=>!['Heard','Loved','Wrong'].includes(s.title)));
 await pool.query("DELETE FROM scrobbles WHERE user_id='n'");
 result=await albums(ctx,'did:u',20);assert.deepEqual(encodeAlbums(result[0]).albums.map(a=>a.id),['new']);
 result=await songs(ctx,'did:u',4);assert.deepEqual(encodeSongs(result[0]).recommendations,[]);
 } finally {await pool.end();}
});

test('Recommendation handlers coalesce Drift requests and fall back to the local database',{skip:!process.env.GLEAM_TEST_PGHOST},async()=>{
 const {register}=await import('../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/feed/get_artist_recommendations.mjs');
 const original=globalThis.fetch,env=process.env.DRIFT_URL;process.env.DRIFT_URL='https://drift.test/';let requests=0;
 const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
 try {
  await createTables(pool,['users','user_artists']);await pool.query("INSERT INTO users(xata_id,did,handle,display_name,avatar) VALUES ('u','did:u','u.test','U','')");
  const methods=new Map();register({method:(name,c)=>methods.set(name,c)},{db:{pool},read_db:{pool}});
  const invoke=size=>methods.get('app.rocksky.feed.getArtistRecommendations').handler({params:{did:'did:u',limit:size},req:{},res:{}});
  globalThis.fetch=async url=>{requests++;assert.equal(new URL(url).searchParams.get('did'),'did:u');await new Promise(r=>setTimeout(r,15));return Response.json({artists:[{id:'drift'}],extra:'preserved'});};
  const results=await Promise.all([invoke(10),invoke(10)]);assert.equal(requests,1);assert.equal(results[0].body.artists[0].id,'drift');assert.equal(results[1].body.extra,'preserved');
  globalThis.fetch=async()=>{requests++;return new Response('down',{status:503});};
  const fallback=await invoke(11);assert.deepEqual(fallback.body.artists,[]);assert.equal(requests,2);
 }finally{globalThis.fetch=original;if(env===undefined)delete process.env.DRIFT_URL;else process.env.DRIFT_URL=env;await pool.end();}
});
