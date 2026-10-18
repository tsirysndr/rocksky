import assert from 'node:assert/strict';
import {test} from 'node:test';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import {createTables} from './helpers/postgres.mjs';
import {app} from '../build/dev/javascript/rocksky_api/rocksky_api/api.mjs';
test('Root likes and track routes authenticate callers, paginate likes and reject invalid tracks',{skip:!process.env.GLEAM_TEST_PGHOST},async()=>{
 const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
 try {
  await createTables(pool,['users','tracks','loved_tracks']);
  await pool.query("INSERT INTO users(xata_id,did,handle,display_name,avatar) VALUES ('u','did:u','u.test','U',''),('v','did:v','v.test','V','')");
  await pool.query("INSERT INTO tracks(xata_id,title,artist,album,album_artist,sha256,duration) VALUES ('t','T','A','B','A','t',100),('other','Other','A','B','A','other',100)");
  await pool.query("INSERT INTO loved_tracks(user_id,track_id) VALUES ('u','t'),('v','other')");
  const ctx={db:{pool},env:{jwt_secret:'test'},redis:{eval:async()=>1},metrics:{request_counter:{add(){}},request_duration:{record(){}}}};
  const api=app(ctx);const token=jwt.sign({did:'did:u'},'test');const headers={authorization:'Bearer '+token,'content-type':'application/json'};
  for(const [method,path] of [['GET','/likes'],['POST','/likes'],['DELETE','/likes/t'],['POST','/tracks']])assert.equal((await api.request(path,{method})).status,401,`${method} ${path}`);
  let response=await api.request('/likes',{headers});assert.equal(response.status,200);let rows=await response.json();assert.equal(rows.length,1);assert.equal(rows[0].id,'t');assert.equal(rows[0].albumArtist,'A');
  response=await api.request('/likes?offset=1',{headers});assert.deepEqual(await response.json(),[]);
  response=await api.request('/tracks',{method:'POST',headers,body:'{}'});assert.equal(response.status,400);assert.match(await response.text(),/Invalid track data/);
 }finally{await pool.end();}
});
