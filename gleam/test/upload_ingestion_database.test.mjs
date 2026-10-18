import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import {S3Client} from '@aws-sdk/client-s3';
import {createTables} from './helpers/postgres.mjs';
import {app} from '../build/dev/javascript/rocksky_api/rocksky_api/uploads/app.mjs';
test('Audio upload validates real metadata, stores covers and bytes, and rejects duplicate files',{skip:!process.env.GLEAM_TEST_PGHOST},async()=>{
 const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});const dir=await mkdtemp(join(tmpdir(),'rocksky-ingest-test-'));const original=S3Client.prototype.send;const objects=[],indexed=[];
 S3Client.prototype.send=async function(cmd){objects.push(cmd.input);return {};};
 try{
 await createTables(pool,['users','tracks','user_uploads','albums','artists','album_tracks','artist_tracks','artist_albums']);await pool.query("INSERT INTO users(xata_id,did,handle,display_name,avatar) VALUES ('u','did:u','u.test','U','')");
 const hash=createHash('sha256').update('title - artist - album').digest('hex');await pool.query("INSERT INTO tracks(xata_id,title,artist,album_artist,album,sha256,duration,key,bpm,acoustid_fingerprint) VALUES ('t','Title','Artist','Artist','Album',$1,1000,'C major',120,'fp')",[hash]);
 const env={jwt_secret:'test',s3_region:'auto',s3_endpoint:'https://s3.test',s3_access_key_id:'key',s3_secret_access_key:'secret',s3_bucket_name:'music',s3_covers_bucket_name:'covers',cdn_url:'https://cdn.test'};
 const ctx={db:{pool},env,typesense:{collections:()=>({documents:()=>({upsert:async doc=>{indexed.push(doc);return doc;}})})}};const api=app(ctx),token=jwt.sign({did:'did:u'},'test');
 const upload=async(bytes,name='song.mp3')=>{const form=new FormData();if(bytes)form.set('file',new Blob([bytes],{type:'text/plain'}),name);return api.request('/track',{method:'POST',headers:{authorization:'Bearer '+token},body:form});};
 let r=await upload();assert.equal(r.status,400);assert.equal((await r.json()).error,'NO_FILE');r=await upload(Buffer.from('not audio'));assert.equal(r.status,400);assert.equal((await r.json()).error,'INVALID_FORMAT');
 r=await upload(Buffer.from('ID3broken'));assert.equal(r.status,422);
 const cover=join(dir,'cover.png');execFileSync(process.env.FFMPEG_PATH??'ffmpeg',['-v','error','-f','lavfi','-i','color=blue:s=16x16','-frames:v','1','-y',cover]);
 const filename=join(dir,'tagged.mp3');execFileSync(process.env.FFMPEG_PATH??'ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:duration=1','-i',cover,'-map','0:a','-map','1:v','-c:v','copy','-metadata','title=Title','-metadata','artist=Artist','-metadata','album=Album','-metadata','REPLAYGAIN_TRACK_GAIN=0 dB','-id3v2_version','3','-y',filename]);
 const bytes=await readFile(filename);r=await upload(bytes,'é song.mp3');assert.equal(r.status,200,await r.clone().text());const saved=await r.json();assert.equal(saved.trackId,'t');assert.equal(saved.track.title,'Title');assert.equal(objects.length,2);assert.equal(objects[0].Bucket,'covers');assert.equal(objects[1].Metadata.originalFilename,'%C3%A9%20song.mp3');assert.equal(objects[1].ContentLength,objects[1].Body.length);assert.match(objects[1].Key,new RegExp('music/u/'+createHash('sha256').update(objects[1].Body).digest('hex')+'\\.mp3'));assert.equal(indexed[0].id,saved.uploadId);
 r=await upload(bytes);assert.equal(r.status,409);assert.equal((await r.json()).uploadId,saved.uploadId);assert.equal(objects.length,2);
 const row=(await pool.query('SELECT * FROM user_uploads')).rows[0];assert.equal(row.sample_rate,44100);assert.equal(row.user_id,'u');
 const did='did:plc:abcdefghijklmnopqrstuvwx';
 await pool.query("UPDATE users SET did=$1 WHERE xata_id='u'",[did]);
 const writes=[];
 ctx.sqlite={db:{prepare:()=>({all:()=>[]})}};
 ctx.nc={publish(){}};
 ctx.oauth_client={restore:async()=>({did,fetchHandler:async(url,init)=>{
   assert.match(String(url),/com.atproto.repo.putRecord/);
   const p=JSON.parse(typeof init.body==='string'?init.body:Buffer.from(init.body).toString());writes.push(p);const r=p.record,uri=`at://${did}/${p.collection}/${p.rkey}`;
   const hash=value=>createHash('sha256').update(value.toLowerCase()).digest('hex');
   if(p.collection==='app.rocksky.song')await pool.query("INSERT INTO tracks(xata_id,title,artist,album_artist,album,duration,sha256,uri,key,bpm,acoustid_fingerprint) VALUES ('new',$1,$2,$3,$4,$5,$6,$7,'C',120,'fingerprint')",[r.title,r.artist,r.albumArtist,r.album,r.duration,hash(`${r.title} - ${r.artist} - ${r.album}`),uri]);
   if(p.collection==='app.rocksky.artist')await pool.query("INSERT INTO artists(xata_id,name,sha256,uri) VALUES ('a',$1,$2,$3)",[r.name,hash(r.name),uri]);
   if(p.collection==='app.rocksky.album')await pool.query("INSERT INTO albums(xata_id,title,artist,sha256,uri) VALUES ('al',$1,$2,$3,$4)",[r.title,r.artist,hash(`${r.title} - ${r.artist}`),uri]);
   return Response.json({uri,cid:'bafyreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'});
 }})};
 const fresh=join(dir,'fresh.mp3');execFileSync(process.env.FFMPEG_PATH??'ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=550:duration=1','-i',cover,'-map','0:a','-map','1:v','-c:v','copy','-metadata','title=Fresh','-metadata','artist=Artist','-metadata','album=Album','-metadata','date=2026-10','-metadata','REPLAYGAIN_TRACK_GAIN=0 dB','-id3v2_version','4','-y',fresh]);
 const form=new FormData();form.set('file',new Blob([await readFile(fresh)]),'fresh.mp3');
 r=await api.request('/track',{method:'POST',headers:{authorization:'Bearer '+jwt.sign({did},'test')},body:form});
 assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).trackId,'new');assert.equal(writes.length,3);assert.equal(writes.find(w=>w.collection==='app.rocksky.song').record.releaseDate,'2026-10-01T00:00:00.000Z');assert.equal((await pool.query('SELECT * FROM album_tracks')).rowCount,1);

 }finally{S3Client.prototype.send=original;await pool.end();await rm(dir,{recursive:true,force:true});}
});
