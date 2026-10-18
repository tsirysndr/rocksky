import assert from 'node:assert/strict';
import {test} from 'node:test';
import pg from 'pg';
import {createTables} from './helpers/postgres.mjs';
import {Ok} from '../build/dev/javascript/rocksky_api/gleam.mjs';
import {Some} from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';
import * as wrapped from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/stats/get_wrapped.mjs';
import {from_unix_ms} from '../build/dev/javascript/rocksky_api/rocksky_api/db/row.mjs';
import {encode_stats_wrapped_view as encode} from '../build/dev/javascript/rocksky_api/rocksky_api/lexicon/models.mjs';
import {describe} from '../build/dev/javascript/rocksky_api/rocksky_api/error.mjs';
test('Wrapped aggregates a bounded year, genres, prior artists, milestones and streaks', {skip:!process.env.GLEAM_TEST_PGHOST},async()=>{
 const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
 try {
 await createTables(pool,['users','artists','albums','tracks','scrobbles']);
 await pool.query("INSERT INTO users(xata_id,did,handle,display_name,avatar) VALUES ('u','did:u','u.test','U','')");
 await pool.query("INSERT INTO artists(xata_id,name,sha256,genres) VALUES ('a','Artist','a',ARRAY['rock','pop']),('b','Other','b',ARRAY['rock']),('v','Various Artists','v',ARRAY['excluded'])");
 await pool.query("INSERT INTO albums(xata_id,title,artist,sha256) VALUES ('al','Album','Artist','al')");
 await pool.query("INSERT INTO tracks(xata_id,title,artist,album,sha256,duration,album_artist) VALUES ('t','Track','Artist','Album','t',60000,'Artist'),('t2','Other track','Other','Album','t2',120000,'Other')");
 for(const [track,artist,at] of [['t','a','2024-12-31'],['t','a','2025-01-01'],['t','a','2025-01-02'],['t','a','2025-01-03'],['t2','b','2025-02-01'],[null,'v','2025-02-01'],[null,null,'2025-02-01'],['t','a','2026-01-01']])await pool.query('INSERT INTO scrobbles(user_id,track_id,artist_id,album_id,timestamp) VALUES ($1,$2,$3,$4,$5)',['u',track,artist,track?'al':null,at+'T12:00:00Z']);
 const ctx={read_db:{pool}};
 const window=wrapped.period_window('year',new Some(2025),from_unix_ms(Date.parse('2026-03-31T14:00:00Z')));
 let result=await wrapped.retrieve(ctx,'u.test',window);assert.ok(result instanceof Ok,result instanceof Ok?'':describe(result[0]));const v=encode(result[0]);
 assert.equal(v.totalScrobbles,6);assert.equal(v.totalListeningTimeMinutes,5);assert.equal(v.newArtistsCount,2);assert.equal(v.longestStreak,3);assert.equal(v.mostActiveHour,12);assert.equal(v.topTracks[0].title,'Track');assert.equal(v.topArtists.length,2);assert.equal(v.topGenres[0].genre,'rock');assert.equal(v.topGenres[0].count,4);assert.equal(v.firstScrobble.trackTitle,'Track');assert.equal(v.lastScrobble.trackTitle,'Other track');
 result=await wrapped.retrieve(ctx,'missing',window);assert.ok(result instanceof Ok);assert.equal(encode(result[0]).totalScrobbles,0);
 result=await wrapped.retrieve(ctx,'did:u',wrapped.period_window('year',new Some(2020),from_unix_ms(0)));assert.ok(result instanceof Ok,result instanceof Ok?'':describe(result[0]));assert.equal(encode(result[0]).totalScrobbles,0);
 const rolling=wrapped.default_wrapped(wrapped.period_window('month',undefined,from_unix_ms(Date.parse('2025-03-31T14:00:00Z'))));assert.equal(encode(rolling).startDate,'2025-03-03T14:00:00.000Z');
 } finally {await pool.end();}
});
