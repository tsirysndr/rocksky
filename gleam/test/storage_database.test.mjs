import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { S3Client } from '@aws-sdk/client-s3';
import { createTables } from './helpers/postgres.mjs';
import { Ok } from '../build/dev/javascript/rocksky_api/gleam.mjs';
import { Some } from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';
import * as storage from '../build/dev/javascript/rocksky_api/rocksky_api/storage/app.mjs';
import * as deletion from '../build/dev/javascript/rocksky_api/rocksky_api/uploads/delete_service.mjs';
test('Storage providers encrypt keys, verify connectivity, scope ownership and protect active uploads', {skip:!process.env.GLEAM_TEST_PGHOST},async()=>{
 const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
 const original=S3Client.prototype.send;let failure,objects=[],indexDeletes=[];
 S3Client.prototype.send=async function(command){if(failure)throw failure;if(command.constructor.name==='DeleteObjectCommand')objects.push(command.input);return {};};
 try {
 await createTables(pool,['users','user_storage_providers','user_uploads','tracks','albums','album_tracks']);
 await pool.query("INSERT INTO users (xata_id,did,handle,display_name,avatar) VALUES ('u','did:plc:user','u.test','User',''),('v','did:plc:other','v.test','Other','')");
 const ctx={db:{pool},env:{jwt_secret:'test-key',storage_encryption_key:'ab'.repeat(32)},typesense:{collections:()=>({documents:id=>({delete:async()=>{indexDeletes.push(id);return {};}})})}};
 const app=storage.app(ctx),token=jwt.sign({did:'did:plc:user'},'test-key'),other=jwt.sign({did:'did:plc:other'},'test-key');
 const call=(path='/providers',method='GET',body,auth=token)=>app.request(path,{method,headers:{authorization:'Bearer '+auth,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const input={label:'My bucket',endpoint:'https://s3.test',bucket:'music',access_key:'access',secret_key:'secret'};
 failure={$metadata:{httpStatusCode:403}};let response=await call('/providers','POST',input);assert.equal(response.status,422);assert.match((await response.json()).message,/credentials/);assert.equal((await pool.query('SELECT count(*) FROM user_storage_providers')).rows[0].count,0);
 failure=undefined;response=await call('/providers','POST',input);assert.equal(response.status,201);const provider=await response.json();assert.equal(provider.access_key,undefined);assert.equal(provider.region,'auto');
 const stored=(await pool.query('SELECT access_key,secret_key FROM user_storage_providers')).rows[0];assert.notEqual(stored.access_key,'access');assert.notEqual(stored.secret_key,'secret');
 const resolved=await storage.resolve_storage_client(ctx,'u',new Some(provider.id));assert.ok(resolved instanceof Ok);assert.equal((await resolved[0].client.config.credentials()).accessKeyId,'access');assert.ok(!((await storage.resolve_storage_client(ctx,'v',new Some(provider.id))) instanceof Ok));
 const list=await (await call()).json();assert.equal(list.length,1);assert.equal(list[0].secretKey,undefined);assert.equal((await call('/providers/'+provider.id,'DELETE',undefined,other)).status,404);
 await pool.query("INSERT INTO tracks(xata_id,title,artist,album_artist,album,duration,sha256) VALUES ('t','Song','Artist','Artist','Album',123,'sha')");
 await pool.query("INSERT INTO albums(xata_id,title,artist,sha256) VALUES ('a','Album','Artist','sha')");await pool.query("INSERT INTO album_tracks(album_id,track_id) VALUES ('a','t')");
 await pool.query("INSERT INTO user_uploads(xata_id,user_id,track_id,r2_key,mime_type,file_size,original_filename,storage_provider_id) VALUES ('up','u','t','object','audio/flac',100,'song.flac',$1),('other','v','t','foreign','audio/flac',100,'song.flac',NULL)",[provider.id]);
 assert.equal((await call('/providers/'+provider.id,'DELETE')).status,409);
 let deleted=await deletion.delete_uploads_for_album_id(ctx,'did:plc:user','a');assert.ok(deleted instanceof Ok);assert.equal(deleted[0],1);assert.deepEqual(objects,[{Bucket:'music',Key:'object'}]);assert.deepEqual(indexDeletes,['up']);
 assert.equal((await pool.query('SELECT count(*) FROM tracks')).rows[0].count,1);assert.equal((await pool.query('SELECT user_id FROM user_uploads')).rows[0].user_id,'v');
 assert.equal((await call('/providers/'+provider.id,'DELETE')).status,204);
 assert.ok(!((await deletion.delete_uploads_for_track(ctx,'did:plc:unknown','t')) instanceof Ok));
 } finally {S3Client.prototype.send=original;await pool.end();}
});
