import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Hono} from 'hono';
import {PgDialect} from 'drizzle-orm/pg-core';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='users-details-test';process.env.JWT_SECRET='detail-secret';
const D=await import('../output/Rocksky.Users.Details/index.js');const dialect=new PgDialect();
function setup(answers){const queries=[],metrics=[];const db={select(fields){const call={fields};queries.push(call);const q={from(){return q},leftJoin(){return q},innerJoin(){return q},where(w){call.where=dialect.sqlToQuery(w);return q},orderBy(...o){call.order=o.map(x=>dialect.sqlToQuery(x).sql);return q},limit(n){call.limit=n;return q},async execute(){assert.ok(answers.length);return answers.shift()}};return q}};const app=new Hono();D.register({db,metrics:{requestCounter:{add(_n,tags){metrics.push(tags)}}}})(app)();return {app,queries,metrics}}
for(const [kind,answers,message] of [['scrobble',[[]],'Scrobble'],['artist',[[]],'Artist'],['album',[[]],'Album'],['song',[[],[]],'Track'],['playlist',[[]],'Playlist']]){const m=setup(answers);const r=await m.app.request('/did:plc:x/app.rocksky.'+kind+'/key');assert.equal(r.status,404);assert.equal(await r.text(),message+' not found');assert.equal(m.metrics.length,1)}
{
 const m=setup([[{scrobbles:{id:'s'},tracks:{id:'t',title:'Track'},users:{id:'u'}}],[{count:0}],[{count:'0'}]]);const r=await m.app.request('/did:plc:x/app.rocksky.scrobble/key');assert.deepEqual(await r.json(),{id:'s',tracks:{id:'t',title:'Track'},users:{id:'u'},listeners:1,scrobbles:'0',tags:[]});assert.deepEqual(m.queries[0].where.params,['at://did:plc:x/app.rocksky.scrobble/key']);assert.deepEqual(m.queries[1].where.params,['t']);
}
{
 const m=setup([[{artists:{id:'a',name:'Artist'}}],[{count:'2'}],[{count:3}]]);const r=await m.app.request('/did/app.rocksky.artist/key');assert.deepEqual(await r.json(),{id:'a',name:'Artist',listeners:'2',scrobbles:3,tags:[]});assert.equal(m.queries[0].where.params.length,2);
}
{
 const m=setup([[{albums:{id:'a',title:'Album'}}],[{tracks:{id:'t1',trackNumber:1,discNumber:1,label:'Label',lyrics:null}},{tracks:{id:'t2',trackNumber:2,discNumber:1,label:'Other',lyrics:'words'}}],[{count:1}],[{count:2}]]);const r=await m.app.request('/did/app.rocksky.album/key');const result=await r.json();assert.equal(result.label,'Label');assert.deepEqual(result.tracks.map(t=>t.id),['t2'],'source snake-case dedup collapses camelCase positions and prefers lyrics');assert.match(m.queries[1].order[0],/track_number/);
 assert.deepEqual(D.albumTracks([{id:'two',disc_number:1,track_number:2,lyrics:null},{id:'one',disc_number:1,track_number:1,lyrics:null},{id:'replacement',disc_number:1,track_number:1,lyrics:'x'}]).map(t=>t.id),['replacement','two']);
}
{
 const m=setup([[{id:'direct',title:'Direct'}],[{tracks:{id:'alias',title:'Alias'}}],[{count:0}],[{count:0}]]);const r=await m.app.request('/did/app.rocksky.song/key');assert.equal((await r.json()).id,'direct');assert.deepEqual(m.queries[2].where.params,['direct']);
}
{
 const m=setup([[{playlists:{id:'p',name:'Playlist'},users:{id:'u'}}],[{tracks:{id:'t',title:'Track'}}],[{id:'t',sha256:'hash'}],[{sha256:'hash',did:'someone'}]]);const r=await m.app.request('/did/app.rocksky.playlist/key',{headers:{authorization:'Bearer invalid'}});assert.equal(r.status,200);assert.deepEqual(await r.json(),{id:'p',name:'Playlist',curatedBy:{id:'u'},tracks:[{id:'t',title:'Track',liked:false,likesCount:1}]});assert.match(m.queries[1].order[0],/xata_createdat/);assert.equal(m.queries[0].limit,undefined);
}
console.log('Users details: missing records, raw count fallbacks, source scrobble overwrite/album dedup, direct-song preference and public playlist likes passed');
