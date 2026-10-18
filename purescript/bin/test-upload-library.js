import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Hono} from 'hono';
import jwt from 'jsonwebtoken';
import {PgDialect} from 'drizzle-orm/pg-core';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='upload-library-test';
process.env.JWT_SECRET='upload-library-secret';
const L=await import('../output/Rocksky.Uploads.Library/index.js');const {fromAff}=await import('../output/Control.Promise/index.js');const run=a=>fromAff(a)();const dialect=new PgDialect();const user={id:'user',did:'did:plc:test'};const auth='Bearer '+jwt.sign({did:user.did},process.env.JWT_SECRET);
function mock(answers){const calls=[];const db={select(fields){const call={fields};calls.push(call);const q={from(){return q},innerJoin(){return q},leftJoin(){return q},where(w){call.where=dialect.sqlToQuery(w);return q},orderBy(...order){call.order=order.map(o=>dialect.sqlToQuery(o).sql);return q},groupBy(){return q},limit(n){call.limit=n;return q},offset(n){call.offset=n;return q},async execute(){assert.ok(answers.length);return answers.shift()}};return q},insert(){const call={};calls.push(call);const q={values(v){call.values=v;return q},onConflictDoUpdate(v){call.conflict=v;return q},async execute(){}};return q}};return {db,calls}}
const params={size:50,offset:0,q:'',albumUri:'',albumArtist:'',albumName:''};
{
 const m=mock([[{upload:{id:'one'},track:{title:'T'}}]]);await run(L.listUploads({db:m.db})('user')({...params,albumUri:'at://album',albumArtist:'ignored',albumName:'ignored',size:12.5,offset:-2}));assert.deepEqual(m.calls[0].where.params,['user','at://album']);assert.equal(m.calls[0].order.length,3);assert.equal(m.calls[0].limit,12.5);assert.equal(m.calls[0].offset,-2);
}
{
 const m=mock([[{upload:{id:'a'},track:{title:'A'}},{upload:{id:'b'},track:{title:'B'}}]]);let search;
 const typesense={collections(){return {documents(){return {async search(p){search=p;return {hits:[{document:{id:'b'}},{document:{id:'missing'}},{document:{id:'a'}}]}}}}}}};
 const result=await run(L.listUploads({db:m.db,typesense})('user')({...params,q:'find',offset:-1}));assert.deepEqual(result.map(r=>r.upload.id),['b','a']);assert.equal(search.page,0);assert.equal(search.filter_by,'user_id:=user');assert.deepEqual(m.calls[0].where.params,['user','b','missing','a']);
}
{
 const m=mock([[],[]]);await run(L.listAlbums({db:m.db})('user')({...params,q:'RoCK'}));await run(L.listArtists({db:m.db})('user')({...params,q:'RoCK'}));assert.deepEqual(m.calls[0].where.params,['user','%rock%','%rock%']);assert.deepEqual(m.calls[1].where.params,['user','%rock%']);assert.match(dialect.sqlToQuery(m.calls[0].fields.trackCount).sql,/count\(distinct/);
}
{
 const m=mock([[{uploadIds:'["b","missing","a","b"]',currentIndex:7}],[{uploadId:'a',title:'A',songUri:'at://song'},{uploadId:'b',title:'B',songUri:null}]]);const result=await run(L.getQueue({db:m.db})('user'));assert.deepEqual(result.queue.map(r=>r.uploadId),['b','a','b']);assert.equal(result.queue[0].songUri,'');assert.equal(result.queue[0].title,'B');assert.equal(result.currentIndex,7);assert.equal(m.calls[1].where.params.at(-1),'user');
 const empty=mock([[{uploadIds:'[]',currentIndex:9}]]);assert.deepEqual(await run(L.getQueue({db:empty.db})('user')),{queue:[],currentIndex:0});
 assert.equal(await run(L.putQueue({db:m.db})('user')({uploadIds:[null,3,'id'],currentIndex:2.5})),true);const write=m.calls.at(-1);assert.equal(write.values[0].uploadIds,'[null,3,"id"]');assert.equal(write.values[0].currentIndex,2.5);assert.ok(write.conflict.set.updatedAt instanceof Date);assert.equal('updatedAt' in write.values[0],false);assert.equal(await run(L.putQueue({db:m.db})('user')({uploadIds:'id',currentIndex:2})),false);
}
{
 const a=new Hono();L.register({})(a)();for(const [method,path] of [['GET','/'],['GET','/albums'],['GET','/artists'],['GET','/queue'],['PUT','/queue'],['DELETE','/album'],['DELETE','/by-album/x'],['DELETE','/by-track/x'],['DELETE','/x']]){const r=await a.request(path,{method});assert.equal(r.status,401);assert.equal(await r.text(),'Unauthorized')};const count=await a.request('/count');assert.equal(count.status,401);assert.deepEqual(await count.json(),{error:'Unauthorized'});
 const m=mock([[user]]),b=new Hono();L.register({db:m.db})(b)();const invalid=await b.request('/album',{method:'DELETE',headers:{authorization:auth}});assert.equal(invalid.status,400);assert.equal((await invalid.json()).error,'MISSING_ALBUM');
 const missing=mock([[user],[]]),c=new Hono();L.register({db:missing.db})(c)();const response=await c.request('/by-track/x',{method:'DELETE',headers:{authorization:auth}});assert.equal(response.status,404);assert.ok(missing.calls[1].where.params.includes('user'));assert.ok(missing.calls[1].where.params.includes('x'));
}
console.log('Upload library: listings/search order, owner scopes, album filters, aggregates, queue parity, anonymous guards and deletion preconditions passed');
