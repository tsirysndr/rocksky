import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import sodium from 'libsodium-wrappers';
import { createTables } from './helpers/postgres.mjs';
import { app as accessApp } from '../build/dev/javascript/rocksky_api/rocksky_api/access_tokens/app.mjs';
import { app as keysApp } from '../build/dev/javascript/rocksky_api/rocksky_api/apikeys/app.mjs';
test('Token routes encrypt access secrets, return metadata only, scope mutations and enforce revocation', {skip:!process.env.GLEAM_TEST_PGHOST},async()=>{
 const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
 try {
  await createTables(pool,['users','access_tokens','api_keys']);
  await pool.query("INSERT INTO users (xata_id,did,handle,display_name,avatar) VALUES ('u','did:plc:user','u.test','User',''),('v','did:plc:other','v.test','Other','')");
  const ctx={db:{pool},env:{jwt_secret:'test-signing-secret',storage_encryption_key:'12'.repeat(32)}};
  const token=jwt.sign({did:'did:plc:user'},ctx.env.jwt_secret),other=jwt.sign({did:'did:plc:other'},ctx.env.jwt_secret);
  const app=accessApp(ctx);const keys=keysApp(ctx);
  const call=(app,path='/',method='GET',body,auth=token)=>app.request(path,{method,headers:{authorization:'Bearer '+auth,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  assert.equal((await call(app,'/','POST',{name:'  '})).status,400);
  const created=await (await call(app,'/','POST',{name:'  CLI  '})).json();assert.equal(created.name,'CLI');assert.equal(created.lastFour,created.token.slice(-4));assert.ok(created.token);
  const stored=(await pool.query('SELECT token_encrypted,jti FROM access_tokens')).rows[0];assert.notEqual(stored.token_encrypted,created.token);
  await sodium.ready;const raw=sodium.from_base64(stored.token_encrypted),nonce=raw.slice(0,sodium.crypto_secretbox_NONCEBYTES);assert.equal(sodium.to_string(sodium.crypto_secretbox_open_easy(raw.slice(nonce.length),nonce,sodium.from_hex(ctx.env.storage_encryption_key))),created.token);
  assert.equal(jwt.verify(created.token,ctx.env.jwt_secret).jti,stored.jti);
  const listed=await (await call(app)).json();assert.equal(listed.length,1);assert.deepEqual(Object.keys(listed[0]).sort(),['id','name','lastFour','lastUsedAt','createdAt','updatedAt'].sort());
  assert.equal((await call(app,'/'+created.id,'DELETE',undefined,other)).status,404);
  assert.equal((await call(app,'/','GET',undefined,created.token)).status,200);
  assert.equal((await call(app,'/'+created.id,'DELETE')).status,200);
  assert.equal((await call(app,'/','GET',undefined,created.token)).status,401);
  const key=await (await call(keys,'/','POST',{name:'App',description:'Description',enabled:false})).json();assert.match(key.api_key,/^[a-f0-9]{32}$/);assert.match(key.shared_secret,/^[a-f0-9]{32}$/);
  const all=await (await call(keys)).json();assert.equal(all[0].enabled,false);assert.equal(all[0].userId,undefined);
  assert.equal((await call(keys,'/'+key.id,'PUT',{name:'Changed',enabled:true})).status,200);assert.equal((await (await call(keys)).json())[0].name,'Changed');
  await call(keys,'/'+key.id,'DELETE',undefined,other);assert.equal((await (await call(keys)).json()).length,1);
  await call(keys,'/'+key.id,'DELETE');assert.equal((await (await call(keys)).json()).length,0);
 } finally {await pool.end();}
});
