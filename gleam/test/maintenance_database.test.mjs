import assert from 'node:assert/strict';
import {test} from 'node:test';
import pg from 'pg';
import {createTables} from './helpers/postgres.mjs';
import {Ok,toList} from '../build/dev/javascript/rocksky_api/gleam.mjs';
import {describe} from '../build/dev/javascript/rocksky_api/rocksky_api/error.mjs';
import {take_batch} from '../build/dev/javascript/rocksky_api/rocksky_api/scripts/backfill_analysis.mjs';
import {execute as avatar} from '../build/dev/javascript/rocksky_api/rocksky_api/scripts/avatar.mjs';
import {execute as likes} from '../build/dev/javascript/rocksky_api/rocksky_api/scripts/likes.mjs';
import {execute as spotify} from '../build/dev/javascript/rocksky_api/rocksky_api/scripts/spotify.mjs';
import {execute as library} from '../build/dev/javascript/rocksky_api/rocksky_api/scripts/sync_library.mjs';
import {update_uris} from '../build/dev/javascript/rocksky_api/rocksky_api/scripts/sync.mjs';
import {execute as playlist} from '../build/dev/javascript/rocksky_api/rocksky_api/scripts/sync_library_playlist.mjs';
import {sha256_hex,aes_ctr_decrypt} from '../build/dev/javascript/rocksky_api/rocksky_api/node/crypto.mjs';

test('Analysis batching advances past consumed duplicate uploads without skipping the next batch',()=>{
 const rows=toList([{id:'1',track_id:'a'},{id:'2',track_id:'a'},{id:'3',track_id:'b'},{id:'4',track_id:'c'}]);
 const result=take_batch(rows,toList([]),2,'',toList([]));
 assert.deepEqual(result[0].toArray().map(r=>r.track_id),['a','b']);assert.equal(result[2],'3');
 const rest=take_batch(toList([{id:'4',track_id:'c'}]),result[1],2,result[2],toList([]));assert.equal(rest[2],'4');assert.equal(rest[0].toArray()[0].track_id,'c');
});

test('Maintenance commands repair relationships, replay events, encrypt secrets and honor playlist dry runs',{skip:!process.env.GLEAM_TEST_PGHOST},async()=>{
 const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});const messages=[];const old=process.env.SKIP_AVATAR_UPDATE;process.env.SKIP_AVATAR_UPDATE='1';
 try {
 await createTables(pool,['users','artists','albums','tracks','scrobbles','artist_albums','loved_tracks','spotify_apps','navidrome_playlists','navidrome_playlist_tracks']);
 await pool.query("INSERT INTO users(xata_id,did,handle,display_name,avatar) VALUES ('u','did:u','u.test','U','avatar')");
 await pool.query("INSERT INTO artists(xata_id,name,sha256,uri) VALUES ('a','Artist',$1,'at://artist')",[sha256_hex('artist')]);
 await pool.query("INSERT INTO albums(xata_id,title,artist,sha256,uri) VALUES ('al','Album','Artist',$1,'at://album')",[sha256_hex('album - artist')]);
 await pool.query("INSERT INTO tracks(xata_id,title,artist,album,album_artist,sha256,duration,uri) VALUES ('t','Title','Artist','Album','Artist',$1,1000,'at://track')",[sha256_hex('title - artist - album')]);
 await pool.query("INSERT INTO scrobbles(user_id,track_id,timestamp) VALUES ('u','t',now())");
 await pool.query("INSERT INTO loved_tracks(user_id,track_id,uri) VALUES ('u','t','at://like')");
 await pool.query("INSERT INTO navidrome_playlists(xata_id,user_id,name) VALUES ('p','u','Playlist')");
 await pool.query("INSERT INTO navidrome_playlist_tracks(playlist_id,track_id) VALUES ('p','t')");
 const ctx={db:{pool},env:{spotify_encryption_key:'11'.repeat(32),spotify_encryption_iv:'22'.repeat(16)},nc:{publish:(subject,data)=>messages.push([subject,JSON.parse(Buffer.from(data).toString())]),flush:async()=>{}}};
 const check=async task=>{const result=await task;assert.ok(result instanceof Ok,result instanceof Ok?'':describe(result[0]));return result[0];};
 await check(update_uris(ctx,'u.test',20));let row=(await pool.query('SELECT artist_uri,album_uri FROM tracks')).rows[0];assert.deepEqual(row,{artist_uri:'at://artist',album_uri:'at://album'});assert.equal((await pool.query('SELECT artist_uri FROM albums')).rows[0].artist_uri,'at://artist');
 await check(library(ctx,toList([])));await check(library(ctx,toList([])));assert.equal((await pool.query('SELECT * FROM artist_albums')).rowCount,1);
 await check(avatar(ctx,toList(['did:u'])));await check(likes(ctx,toList([])));assert.deepEqual(messages.map(m=>m[0]),['rocksky.user','rocksky.like']);assert.equal(messages[0][1].display_name,'U');assert.deepEqual(messages[1][1].track_id,{xata_id:'t'});
 await check(spotify(ctx,toList(['client','secret'])));row=(await pool.query('SELECT spotify_secret FROM spotify_apps')).rows[0];assert.notEqual(row.spotify_secret,'secret');assert.equal(aes_ctr_decrypt(row.spotify_secret,ctx.env.spotify_encryption_key,ctx.env.spotify_encryption_iv)[0],'secret');
 await check(playlist(ctx,toList(['did:u','p','--dry-run'])));assert.equal((await pool.query('SELECT uri FROM navidrome_playlists')).rows[0].uri,null);
 }finally{if(old==null)delete process.env.SKIP_AVATAR_UPDATE;else process.env.SKIP_AVATAR_UPDATE=old;await pool.end();}
});

test('Record deduplication prefers indexed URIs over older duplicates',async()=>{
 const {Artist,Song,RepoRecord,identity_key,plan}=await import('../build/dev/javascript/rocksky_api/rocksky_api/scripts/dedup_records.mjs');
 assert.equal(identity_key(new Artist(),{name:'MiXeD'})[0],'mixed');assert.equal(identity_key(new Song(),{title:'T',artist:'A',album:'B'})[0],'t - a - b');
 const records=toList([new RepoRecord('old','a','2020','same'),new RepoRecord('indexed','b','2021','same'),new RepoRecord('new','c','2022','same')]);
 const plans=plan(records,toList(['indexed'])).toArray();assert.equal(plans[0].keeper.uri,'indexed');assert.deepEqual(plans[0].gone.toArray().map(r=>r.uri),['old','new']);
 assert.equal(plan(records,toList([])).toArray()[0].keeper.uri,'old');
});

test('URI backfill guards existing assignments and Discogs cursors preserve sub-millisecond ordering',{skip:!process.env.GLEAM_TEST_PGHOST},async()=>{
 const {Some}=await import('../build/dev/javascript/gleam_stdlib/gleam/option.mjs');
 const orm=await import('../build/dev/javascript/rocksky_api/rocksky_api/drizzle/orm.mjs');
 const albumSchema=await import('../build/dev/javascript/rocksky_api/rocksky_api/drizzle/schema/albums.mjs');
 const {pending_after}=await import('../build/dev/javascript/rocksky_api/rocksky_api/scripts/backfill_discogs.mjs');
 const {from_user_tracks,apply_uri,candidate_dids}=await import('../build/dev/javascript/rocksky_api/rocksky_api/scripts/backfill_track_uri.mjs');
 const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
 try {
 await createTables(pool,['users','user_tracks','tracks','scrobbles','albums']);
 await pool.query("INSERT INTO users(xata_id,did,handle,display_name,avatar) VALUES ('u','did:u','u.test','U','')");
 await pool.query("INSERT INTO tracks(xata_id,title,artist,album,album_artist,sha256,duration,uri) VALUES ('missing','T','A','B','A','missing',1,NULL),('claimed','T2','A','B','A','claimed',1,'at://did:u/app.rocksky.song/taken'),('other','T3','A','B','A','other',1,NULL)");
 await pool.query("INSERT INTO user_tracks(user_id,track_id,uri) VALUES ('u','missing','at://did:u/app.rocksky.song/free'),('u','other','at://did:u/app.rocksky.song/taken')");
 const ctx={db:{pool}};const check=async task=>{const r=await task;assert.ok(r instanceof Ok,r instanceof Ok?'':describe(r[0]));return r[0];};
 assert.equal(await check(from_user_tracks(ctx,true)),1);assert.equal((await pool.query("SELECT uri FROM tracks WHERE xata_id='missing'")).rows[0].uri,null);
 assert.equal(await check(from_user_tracks(ctx,false)),1);assert.equal(await check(apply_uri(ctx,'missing','at://new',false)),0);assert.equal(await check(apply_uri(ctx,'other','at://did:u/app.rocksky.song/taken',false)),0);
 assert.deepEqual((await check(candidate_dids(ctx,false))).toArray(),['did:u']);
 await pool.query("INSERT INTO albums(xata_id,title,artist,sha256,xata_createdat) VALUES ('z','First','A','z','2026-01-01 00:00:00.000001'),('a','Second','A','a','2026-01-01 00:00:00.000002')");
 const rows=await check(orm.all(orm.where(orm.from(albumSchema.table()),pending_after(new Some('z'))),ctx.db));assert.deepEqual(rows.toArray().map(r=>r.id),['a']);
 }finally{await pool.end();}
});

test('Session expiry maintenance accepts sessions without an expiry claim',async()=>{
 const {default:Database}=await import('better-sqlite3');
 const {update_expires_at}=await import('../build/dev/javascript/rocksky_api/rocksky_api/scripts/exp.mjs');
 const db=new Database(':memory:');
 try {
  db.exec('CREATE TABLE auth_session (key TEXT PRIMARY KEY, session TEXT NOT NULL, expiresAt TEXT)');
  db.prepare('INSERT INTO auth_session(key,session) VALUES (?,?)').run('without',JSON.stringify({tokenSet:{}}));
  db.prepare('INSERT INTO auth_session(key,session) VALUES (?,?)').run('with',JSON.stringify({tokenSet:{expires_at:'2026-12-01T00:00:00Z'}}));
  const result=await update_expires_at({sqlite:{db}});assert.ok(result instanceof Ok,result instanceof Ok?'':describe(result[0]));
  assert.equal(db.prepare("SELECT expiresAt FROM auth_session WHERE key='without'").get().expiresAt,null);
  assert.equal(db.prepare("SELECT expiresAt FROM auth_session WHERE key='with'").get().expiresAt,'2026-12-01T00:00:00Z');
 }finally{db.close();}
});
