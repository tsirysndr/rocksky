import assert from 'node:assert/strict';
import {test} from 'node:test';
import pg from 'pg';
import {createTables} from './helpers/postgres.mjs';
import {Ok} from '../build/dev/javascript/rocksky_api/gleam.mjs';
import {None} from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';
import {Record} from '../build/dev/javascript/rocksky_api/rocksky_api/atproto/agent.mjs';
import {describe} from '../build/dev/javascript/rocksky_api/rocksky_api/error.mjs';
import {insert_artist,insert_album,insert_song,insert_scrobble} from '../build/dev/javascript/rocksky_api/rocksky_api/scripts/collections.mjs';
test('Collection restoration imports a complete catalog and safely replays duplicate records',{skip:!process.env.GLEAM_TEST_PGHOST},async()=>{
 const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
 const messages=[];
 try {
  const tables=['users','artists','albums','tracks','scrobbles','user_artists','user_albums','user_tracks','artist_albums','artist_tracks','album_tracks','feeds'];
  await createTables(pool,tables);
  for(const table of ['artists','albums','tracks'])await pool.query(`CREATE UNIQUE INDEX ON ${table}(sha256)`);
  for(const [table,columns] of [['user_artists','user_id,artist_id'],['user_albums','user_id,album_id'],['user_tracks','user_id,track_id'],['artist_albums','artist_id,album_id'],['artist_tracks','artist_id,track_id'],['album_tracks','album_id,track_id'],['scrobbles','uri']])await pool.query(`CREATE UNIQUE INDEX ON ${table}(${columns})`);
  await pool.query("INSERT INTO users(xata_id,did,handle,display_name,avatar) VALUES ('u','did:u','u.test','U','')");
  const ctx={db:{pool},redis:{incr:async()=>1,del:async()=>1},nc:{publish:(subject,data)=>messages.push([subject,JSON.parse(Buffer.from(data).toString())])}};
  const createdAt='2026-01-01T12:00:00.000Z';
  const record=(type,value)=>new Record(`at://did:u/app.rocksky.${type}/one`,new None(),{$type:`app.rocksky.${type}`,createdAt,...value});
  const song={title:'Track',artist:'Artist',album:'Album',albumArtist:'Artist',duration:123000};
  const check=async p=>{const r=await p;assert.ok(r instanceof Ok,r instanceof Ok?'':describe(r[0]));};
  for(let i=0;i<2;i++) {
   await check(insert_artist(ctx,'u',record('artist',{name:'Artist'})));
   await check(insert_album(ctx,'u',record('album',{title:'Album',artist:'Artist',year:2026})));
   await check(insert_song(ctx,'u',record('song',song)));
   await check(insert_scrobble(ctx,'u',record('scrobble',song)));
  }
  await new Promise(resolve=>setTimeout(resolve,25));
  for(const table of tables.filter(t=>t!=='feeds'))assert.equal((await pool.query(`SELECT * FROM ${table}`)).rowCount,1,table);
  const track=(await pool.query('SELECT artist_uri,album_uri FROM tracks')).rows[0];
  assert.equal(track.artist_uri,'at://did:u/app.rocksky.artist/one');assert.equal(track.album_uri,'at://did:u/app.rocksky.album/one');
  assert.equal(messages.filter(([s])=>s==='rocksky.scrobble').length,2);
 }finally{await pool.end();}
});
