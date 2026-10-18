import assert from 'node:assert/strict';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import { app } from '../build/dev/javascript/rocksky_api/rocksky_api/bsky/app.mjs';
import { new_memory } from '../build/dev/javascript/rocksky_api/rocksky_api/kv.mjs';
test('Bluesky login, callback and one-time tokens preserve web and CLI lifetimes',async()=>{
 const did='did:plc:abcdefghijklmnopqrstuvwx',handle='alice.test',calls=[];
 const ctx={env:{jwks_json:'{"keys":[]}',jwt_secret:'test-secret',frontend_url:'https://front.test',rocksky_signup_pds:'https://signup.test'},metrics:{request_counter:{add(){}}},kv:new_memory(),oauth_client:{
  clientMetadata:{client_name:'Rocksky'},authorize:async(input,options)=>{calls.push({input,options});return new URL('https://auth.test/authorize');},callback:async()=>({session:{did}})
 },resolver:{did:{resolveAtprotoData:async()=>({did,handle,pds:'https://pds.test',signingKey:'key'})},handle:{resolve:async()=>did}},db:{pool:{query:async()=>({rows:[],rowCount:0})}}};
 const server=app(ctx);
 assert.equal((await server.request('/login?handle=invalid')).status,400);
 assert.equal((await server.request('/login?handle='+handle+'&cli=1')).status,302);assert.equal(calls[0].input,handle);assert.match(calls[0].options.scope,/repo:app.rocksky.song/);
 const callback=await server.request('/oauth/callback?code=test');assert.equal(callback.status,302);assert.equal(callback.headers.get('location'),'https://front.test?did='+did+'&cli=1');
 let response=await server.request('/token',{headers:{'session-did':did}});assert.equal(response.status,200);const token=(await response.json()).token;const claims=jwt.verify(token,'test-secret');assert.equal(claims.exp-claims.iat,86400*365*1000);
 assert.equal((await server.request('/token',{headers:{'session-did':did}})).status,401);
 await server.request('/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({handle})});await server.request('/oauth/callback?code=test');response=await server.request('/token',{headers:{'session-did':did}});const web=jwt.verify((await response.json()).token,'test-secret');assert.equal(web.exp-web.iat,86400*7);
 await server.request('/login?prompt=create');assert.equal(calls.at(-1).input,'https://signup.test');
 assert.deepEqual(await (await server.request('/oauth-client-metadata.json')).json(),{client_name:'Rocksky'});assert.equal((await (await server.request('/jwks.json')).json()).keys.length,0);
 ctx.oauth_client.callback=async()=>{throw new Error('invalid code');};assert.equal((await server.request('/oauth/callback')).headers.get('location'),'https://front.test?error=1');
});
