import assert from 'node:assert/strict';
import {test} from 'node:test';
import pg from 'pg';
import {createTables} from './helpers/postgres.mjs';
import {Ok} from '../build/dev/javascript/rocksky_api/gleam.mjs';
import {fill_album,fill_artist,Updated,title_variants} from '../build/dev/javascript/rocksky_api/rocksky_api/scripts/backfill_riff.mjs';
import {new$ as cache} from '../build/dev/javascript/rocksky_api/rocksky_api/lib/query_cache.mjs';
import {from,all} from '../build/dev/javascript/rocksky_api/rocksky_api/drizzle/orm.mjs';
import {table as albums} from '../build/dev/javascript/rocksky_api/rocksky_api/drizzle/schema/albums.mjs';
import {table as artists} from '../build/dev/javascript/rocksky_api/rocksky_api/drizzle/schema/artists.mjs';
import {describe} from '../build/dev/javascript/rocksky_api/rocksky_api/error.mjs';
test('Riff backfill honors dry runs, caches lookups and survives an already claimed Spotify link',{skip:!process.env.GLEAM_TEST_PGHOST},async()=>{
 const original=globalThis.fetch;let requests=0;
 const pool=new pg.Client({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
 try {
  await pool.connect();
  await createTables(pool,['albums','artists']);await pool.query('CREATE UNIQUE INDEX albums_spotify_link_unique ON albums(spotify_link)');
  await pool.query("INSERT INTO albums(xata_id,title,artist,sha256,album_art,spotify_link) VALUES ('a','Album (Deluxe)','Artist','a','https://cdn.rocksky.app/old',NULL),('b','Other','Artist','b',NULL,'https://open.spotify.com/album/claimed')");
  await pool.query("INSERT INTO artists(xata_id,name,sha256) VALUES ('ar','Artist','ar')");
  const hit={images:[{url:'https://images.test/new'}],release_date:'2024-05-01',genres:['rock'],external_urls:{spotify:'https://open.spotify.com/album/claimed'}};
  globalThis.fetch=async url=>{requests++;const kind=new URL(url).searchParams.get('type');return Response.json({[kind+'s']:{items:[hit]}});};
  const ctx={db:{pool},env:{riff_api_url:'https://riff.test'}};const memo=cache(60000,20);
  const check=async task=>{const r=await task;assert.ok(r instanceof Ok,r instanceof Ok?'':describe(r[0]));return r[0];};
  const album=(await check(all(from(albums()),ctx.db))).toArray().find(x=>x.id==='a');
  assert.ok((await check(fill_album(ctx,memo,album,true))) instanceof Updated);
  assert.equal((await pool.query("SELECT album_art FROM albums WHERE xata_id='a'")).rows[0].album_art,'https://cdn.rocksky.app/old');
  await check(fill_album(ctx,memo,album,false));assert.equal(requests,1);
  assert.deepEqual((await pool.query("SELECT album_art,year,release_date,spotify_link FROM albums WHERE xata_id='a'")).rows[0],{album_art:'https://images.test/new',year:2024,release_date:'2024-05-01',spotify_link:null});
  const artist=(await check(all(from(artists()),ctx.db))).toArray()[0];await check(fill_artist(ctx,memo,artist,false));
  assert.deepEqual((await pool.query('SELECT picture,genres FROM artists')).rows[0],{picture:'https://images.test/new',genres:['rock']});
  assert.ok(title_variants('Album (Deluxe)').toArray().includes('Album'));
 }finally{globalThis.fetch=original;await pool.end();}
});
