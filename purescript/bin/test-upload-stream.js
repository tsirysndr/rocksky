import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Hono} from 'hono';
import jwt from 'jsonwebtoken';
import {PgDialect} from 'drizzle-orm/pg-core';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='upload-stream-test';process.env.JWT_SECRET='stream-secret';
const S=await import('../output/Rocksky.Uploads.Stream/index.js');const AWS=await import('../output/Aws.S3/index.js');const {fromAff,toAffE}=await import('../output/Control.Promise/index.js');const run=a=>fromAff(a)();const aff=f=>toAffE(()=>Promise.resolve().then(f));const dialect=new PgDialect();const user={id:'user',did:'did:plc:test'};const auth='Bearer '+jwt.sign({did:user.did},process.env.JWT_SECRET);
function setup(answers,response){const queries=[],gets=[],tokens=[];const db={select(){const q={from(){return q},where(w){queries.push(dialect.sqlToQuery(w));return q},limit(){return q},async execute(){assert.ok(answers.length);return answers.shift()}};return q}};const redis={async get(key){gets.push(key);return key==='stream:valid'?'user':null},async setEx(...args){tokens.push(args)}};const app=new Hono();const objects=[];S.registerWith({db,redis})(key=>range=>aff(()=>{objects.push({key,range});return response}))(app)();return {app,queries,gets,tokens,objects}}
const body=()=>({transformToWebStream(){return new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2,3]));c.close()}})}});
{
 const m=setup([],{});const r=await m.app.request('/file/stream',{method:'OPTIONS'});assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Max-Age'),'86400');assert.equal(r.headers.get('Access-Control-Allow-Methods'),'GET, OPTIONS');assert.equal(m.queries.length,0);assert.equal((await m.app.request('/file/stream')).status,401);
 const invalid=await m.app.request('/file/stream?token=invalid',{headers:{authorization:auth}});assert.equal(invalid.status,401);assert.equal(m.queries.length,0);assert.deepEqual(m.gets,['stream:invalid']);
}
{
 const m=setup([[user],[user]],{});for(const purpose of ['', '?purpose=cast']){const r=await m.app.request('/stream-token'+purpose,{headers:{authorization:auth}});const data=await r.json();assert.match(data.token,/^[0-9a-f]{40}$/);assert.equal(data.expiresIn,purpose?86400:3600);assert.deepEqual(m.tokens.at(-1),['stream:'+data.token,data.expiresIn,'user'])}
}
{
 const m=setup([[user],[{id:'file',r2Key:'music/key',mimeType:'audio/flac',storageProviderId:'byo'}]],{Body:body(),ContentType:'audio/mpeg',ContentLength:3,ContentRange:'bytes 0-2/100'});const r=await m.app.request('/file/stream?token=valid',{headers:{range:'bytes=0-2'}});assert.equal(r.status,206);assert.equal(r.headers.get('Content-Type'),'audio/flac');assert.equal(r.headers.get('Content-Range'),'bytes 0-2/100');assert.equal(r.headers.get('Content-Length'),'3');assert.equal(r.headers.get('Cache-Control'),'private, max-age=3600');assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[1,2,3]);assert.equal(m.objects[0].key,'music/key');assert.equal(m.objects[0].range.value0,'bytes=0-2');assert.deepEqual(m.queries[1].params,['file','user']);
}
{
 const m=setup([[user],[{r2Key:'k',mimeType:''}]],{Body:body(),ContentType:'audio/ogg'});const r=await m.app.request('/x/stream',{headers:{authorization:auth}});assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'audio/ogg');assert.equal(r.headers.has('Content-Length'),false);assert.equal(r.headers.has('Content-Range'),false);
 const missing=setup([[user],[]],{});assert.equal((await missing.app.request('/x/stream',{headers:{authorization:auth}})).status,404);
 const empty=setup([[user],[{r2Key:'k',mimeType:''}]],{});const fail=await empty.app.request('/x/stream',{headers:{authorization:auth}});assert.equal(fail.status,500);assert.equal(await fail.text(),'Stream unavailable');
}
{
 const commands=[],client={async send(c){commands.push(c.input);return {Body:'raw'}}};assert.deepEqual(await run(AWS.getObjectRaw(client)('bucket')('key')('bytes=1-2')),{Body:'raw'});await run(AWS.getObjectRaw(client)('bucket')('key')(null));assert.deepEqual(commands,[{Bucket:'bucket',Key:'key',Range:'bytes=1-2'},{Bucket:'bucket',Key:'key'}]);
}
console.log('Upload streaming: token TTL/scope/precedence, CORS, owned lookups, range forwarding, raw S3 stream and response headers passed');
