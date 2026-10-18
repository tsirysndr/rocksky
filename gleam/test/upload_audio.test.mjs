import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {File} from 'node-taglib-sharp';
import pg from 'pg';
import {createTables} from './helpers/postgres.mjs';
import {Ok,BitArray} from '../build/dev/javascript/rocksky_api/gleam.mjs';
import {Some,None} from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';
import * as rg from '../build/dev/javascript/rocksky_api/rocksky_api/uploads/replaygain.mjs';
import * as analysis from '../build/dev/javascript/rocksky_api/rocksky_api/uploads/analysis.mjs';
import {describe} from '../build/dev/javascript/rocksky_api/rocksky_api/error.mjs';
test('ReplayGain measures and tags generated audio, preserving bytes on unsupported and failed inputs',async()=>{
 const parsed=rg.parse('[filter] track_gain = -3.25 dB\n[filter] track_peak = 0.75');assert.ok(parsed instanceof Some);assert.equal(parsed[0].gain_db,-3.25);assert.equal(parsed[0].peak,.75);assert.ok(rg.parse('no result') instanceof None);
 const bytes=new BitArray(new Uint8Array([1,2,3]));assert.equal((await rg.ensure_replay_gain(bytes,'wav'))[0],bytes);assert.equal((await rg.ensure_replay_gain(bytes,'mp3'))[0],bytes);
 const dir=await mkdtemp(join(tmpdir(),'rocksky-audio-test-'));
 try{
 const path=join(dir,'tone.mp3');execFileSync(process.env.FFMPEG_PATH??'ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:duration=1','-y',path]);
 const gain=await rg.analyze_track_gain(path);assert.ok(gain instanceof Ok);assert.ok(gain[0] instanceof Some);const result=await rg.write_track_gain(path,gain[0][0]);assert.ok(result instanceof Ok,result instanceof Ok?'':describe(result[0]));
 const file=File.createFromPath(path);try{assert.ok(Math.abs(file.tag.replayGainTrackGain-gain[0][0].gain_db)<.01);assert.ok(Math.abs(file.tag.replayGainTrackPeak-gain[0][0].peak)<.00001);}finally{file.dispose();}
 const tagged=await rg.ensure_replay_gain(new BitArray(new Uint8Array(await readFile(path))),'mp3');assert.ok(tagged instanceof Ok);assert.ok(tagged[0].bitSize>0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('Audio analysis fills missing shared metadata without overwriting prior answers',{skip:!process.env.GLEAM_TEST_PGHOST},async()=>{
 const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
 try{await createTables(pool,['tracks']);await pool.query("INSERT INTO tracks(xata_id,title,artist,album,album_artist,sha256,duration,key) VALUES ('t','T','A','Al','A','t',1000,'C major')");
 let r=await analysis.store_track_analysis({db:{pool}},'t',new analysis.Analysis(new Some('D minor'),new Some(120.5),new Some('fp')));assert.ok(r instanceof Ok,r instanceof Ok?'':describe(r[0]));
 const row=(await pool.query("SELECT key,bpm,acoustid_fingerprint FROM tracks WHERE xata_id='t'")).rows[0];assert.equal(row.key,'C major');assert.equal(row.bpm,120.5);assert.equal(row.acoustid_fingerprint,'fp');
 r=await analysis.store_track_analysis({db:{pool}},'t',new analysis.Analysis(new None(),new None(),new None()));assert.ok(r instanceof Ok);
 }finally{await pool.end();}
});
