import assert from 'node:assert/strict';
import {test} from 'node:test';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import {createTables} from './helpers/postgres.mjs';
import {Ok,Error as GError,toList} from '../build/dev/javascript/rocksky_api/gleam.mjs';
import {app_with_runner} from '../build/dev/javascript/rocksky_api/rocksky_api/history_import/app.mjs';
import * as worker from '../build/dev/javascript/rocksky_api/rocksky_api/history_import/worker.mjs';
import * as parse from '../build/dev/javascript/rocksky_api/rocksky_api/history_import/parse.mjs';
import {Message,describe} from '../build/dev/javascript/rocksky_api/rocksky_api/error.mjs';
test('History parsers handle quoted CSV, both Spotify formats and listening thresholds',()=>{
 assert.deepEqual([...parse.csv_line('"Artist, The","A ""quote""", Album')],['Artist, The','A "quote"','Album']);
 const csv='\ufeffuts,utc_time,artist,artist_mbid,album,album_mbid,track,track_mbid\n1700000000,,Artist,,,,Title,mbid\n0,,Ignored,,,,No,\n';const tracks=[...parse.lastfm_csv(csv)];assert.equal(tracks.length,1);assert.equal(tracks[0].album,'Unknown Album');assert.equal(tracks[0].mb_id[0],'mbid');
 const result=parse.spotify_json(JSON.stringify([{ts:'2020-01-01T00:00:00Z',ms_played:30000,master_metadata_track_name:'Title',master_metadata_album_artist_name:'Artist',spotify_track_uri:'spotify:track:abc'},{endTime:'2020-01-02 13:00',msPlayed:40000,trackName:'Basic',artistName:'Artist'},{endTime:'2020-01-02 13:00',msPlayed:29999,trackName:'Skip',artistName:'Artist'}]));assert.ok(result instanceof Ok);const rows=[...result[0]];assert.equal(rows.length,2);assert.equal(rows[0].spotify_link[0],'https://open.spotify.com/track/abc');assert.equal(rows[1].timestamp[0],Date.parse('2020-01-02T13:00:00Z')/1000);
});
test('History jobs enforce ownership, stale recovery, batched progress, dedup and cancellation',{skip:!process.env.GLEAM_TEST_PGHOST},async()=>{
 const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
 try{
 await createTables(pool,['users','scrobbles','import_jobs']);await pool.query("INSERT INTO users(xata_id,did,handle,display_name,avatar) VALUES ('u','did:u','u.test','U',''),('v','did:v','v.test','V','')");
 const ctx={db:{pool},env:{jwt_secret:'test'}};const state=worker.new$(),starts=[];const api=app_with_runner(ctx,state,(...args)=>starts.push(args));const token=jwt.sign({did:'did:u'},'test');const call=(path,method='GET',body)=>api.request(path,{method,headers:{authorization:'Bearer '+token},...(body?{body}:{})});
 assert.equal(await (await call('/status')).json(),null);assert.equal((await call('/cancel','POST')).status,400);
 const csv='1700000000,,Artist,,Album,,Already,\n1700000001,,Artist,,Album,,Good,\n1700000002,,Artist,,Album,,Bad,\n1700000003,,Artist,,Album,,Other,\n';const form=()=>{const f=new FormData();f.set('file',new Blob([csv]),'history.csv');f.set('type','lastfm');return f;};
 let r=await call('/upload','POST',form());assert.equal(r.status,200);const job=await r.json();assert.equal(job.total,4);assert.equal(starts.length,1);assert.equal((await call('/upload','POST',form())).status,409);
 await pool.query("INSERT INTO scrobbles(user_id,timestamp) VALUES ('u',to_timestamp(1700000000) at time zone 'UTC')");const processed=[];
 let outcome=await worker.run_with(ctx,state,job.id,starts[0][1],'did:u',async track=>{processed.push(track.title);return track.title==='Bad'?new GError(new Message('rejected')):new Ok(undefined);});assert.ok(outcome instanceof Ok,outcome instanceof Ok?'':describe(outcome[0]));assert.deepEqual(processed,['Good','Bad','Other']);
 let status=await (await call('/status')).json();assert.equal(status.total,3);assert.equal(status.processed,2);assert.equal(status.failed,1);assert.equal(status.status,'completed');assert.equal(status.currentTrack,null);assert.match(status.errors,/Bad - Artist: rejected/);
 r=await api.request('/events?token='+token);assert.equal(r.status,200);assert.match(await r.text(),/event: progress/);
 r=await call('/upload','POST',form());const second=await r.json();assert.equal((await call('/cancel','POST')).status,200);outcome=await worker.run_with(ctx,state,second.id,starts[1][1],'did:u',async()=>{throw new Error('cancelled job should not process');});assert.ok(outcome instanceof Ok);assert.equal((await (await call('/status')).json()).status,'cancelled');
 await pool.query("UPDATE import_jobs SET status='running',xata_updatedat=(now() at time zone 'UTC')-interval '31 minutes' WHERE xata_id=$1",[second.id]);assert.equal((await call('/upload','POST',form())).status,200);assert.equal((await pool.query('SELECT status FROM import_jobs WHERE xata_id=$1',[second.id])).rows[0].status,'failed');assert.equal((await (await call('/jobs')).json()).length,3);
 assert.equal((await api.request('/status',{headers:{authorization:'Bearer invalid'}})).status,401);
 }finally{await pool.end();}
});
