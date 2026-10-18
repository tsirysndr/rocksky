import assert from 'node:assert/strict';
import {test} from 'node:test';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import {S3Client} from '@aws-sdk/client-s3';
import {createTables} from './helpers/postgres.mjs';
import {app} from '../build/dev/javascript/rocksky_api/rocksky_api/uploads/app.mjs';
test('Uploads scope browsing, queue hydration, stream tokens, ranges and deletes to their owner',{skip:!process.env.GLEAM_TEST_PGHOST},async()=>{
 const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});const original=S3Client.prototype.send;const commands=[],cache=new Map();
 S3Client.prototype.send=async function(cmd){commands.push(cmd.input);return {Body:{transformToWebStream:()=>new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2,3]));c.close();}})},ContentLength:3,ContentRange:'bytes 0-2/3'};};
 try{
 await createTables(pool,['users','albums','tracks','user_uploads','upload_queue_state']);await pool.query('CREATE UNIQUE INDEX ON upload_queue_state(user_id)');
 await pool.query("INSERT INTO users(xata_id,did,handle,display_name,avatar) VALUES ('u','did:u','u.test','U',''),('v','did:v','v.test','V','')");
 await pool.query("INSERT INTO albums(xata_id,title,artist,sha256,uri,year) VALUES ('al','Album','Artist','al','at://album',2020)");
 for(const [id,title,num] of [['t','Z Song',1],['t2','A Song',2]])await pool.query('INSERT INTO tracks(xata_id,title,artist,album_artist,album,sha256,duration,album_uri,track_number) VALUES ($1,$2,$3,$3,$4,$1,1000,$5,$6)',[id,title,'Artist','Album','at://album',num]);
 for(const [id,user,track] of [['up','u','t'],['up2','u','t2'],['foreign','v','t']])await pool.query("INSERT INTO user_uploads(xata_id,user_id,track_id,r2_key,mime_type,file_size,original_filename) VALUES ($1,$2,$3,$1,'audio/mp3',3,'file.mp3')",[id,user,track]);
 const env={jwt_secret:'test',s3_region:'auto',s3_endpoint:'https://s3.test',s3_access_key_id:'key',s3_secret_access_key:'secret',s3_bucket_name:'music'};
 const ctx={db:{pool},env,redis:{setEx:async(k,ttl,v)=>cache.set(k,{ttl,v}),get:async k=>cache.get(k)?.v},typesense:{collections:()=>({documents:id=>({delete:async()=>({}),search:async()=>({hits:[{document:{id:'up',user_id:'u',track_id:'t',title:'Z Song',artist:'Artist',album:'Album',album_artist:'Artist',duration:1000,r2_key:'up',mime_type:'audio/mp3',file_size:3,uploaded_at:0}}]})})})}};
 const api=app(ctx);const token=jwt.sign({did:'did:u'},'test');const call=(path,method='GET',body,headers={})=>api.request(path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});
 let r=await call('/');assert.equal(r.status,200);let rows=await r.json();assert.deepEqual(rows.map(r=>r.upload.id),['up2','up']);assert.equal(rows[0].albumYear,2020);
 rows=await (await call('/?albumUri=at://album')).json();assert.deepEqual(rows.map(r=>r.upload.id),['up','up2']);assert.equal((await (await call('/?q=Song')).json())[0].upload.id,'up');
 assert.equal((await (await call('/count')).json()).total,2);rows=await (await call('/albums?q=ARTIST')).json();assert.equal(rows[0].trackCount,2);assert.equal(rows[0].albumUri,'at://album');rows=await (await call('/artists')).json();assert.equal(rows[0].albumCount,1);
 assert.equal((await call('/queue','PUT',{uploadIds:['up2','foreign','up','up2'],currentIndex:2})).status,200);let queue=await (await call('/queue')).json();assert.deepEqual(queue.queue.map(r=>r.uploadId),['up2','up','up2']);assert.equal(queue.currentIndex,2);assert.equal(queue.queue[0].songUri,'');
 const credential=await (await call('/stream-token?purpose=cast')).json();assert.equal(credential.expiresIn,86400);assert.equal(cache.get('stream:'+credential.token).ttl,86400);
 r=await api.request('/up/stream?token='+credential.token,{headers:{range:'bytes=0-2'}});assert.equal(r.status,206);assert.equal(r.headers.get('Content-Range'),'bytes 0-2/3');assert.equal((await r.arrayBuffer()).byteLength,3);assert.equal(commands.at(-1).Range,'bytes=0-2');
 assert.equal((await call('/up/stream?token=bad')).status,401);assert.equal((await call('/foreign/stream')).status,404);assert.equal((await api.request('/up/stream',{method:'OPTIONS'})).status,204);
 assert.equal((await call('/album','DELETE')).status,400);assert.equal((await call('/foreign','DELETE')).status,404);assert.equal((await call('/by-track/t','DELETE')).status,200);assert.equal((await pool.query("SELECT count(*) FROM user_uploads WHERE user_id='v'")).rows[0].count,1);
 }finally{S3Client.prototype.send=original;await pool.end();}
});
