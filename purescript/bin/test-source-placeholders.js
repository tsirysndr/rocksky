import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {getTableName} from 'drizzle-orm';
import {PgDialect} from 'drizzle-orm/pg-core';
import axios from 'axios';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='source-parity-test';
const dialect=new PgDialect();const methods=new Map();const queries=[],transactions=[],posts=[];let fail=false;
const db={select(){let table;const q={from(t){table=getTableName(t);return q},where(c){queries.push(dialect.sqlToQuery(c));return q},async execute(){queries.push(table);if(fail)throw Object.assign(new Error('source database failure'),{code:'40001'});return []}};return q},async transaction(f){transactions.push('begin');try{const result=await f(db);transactions.push('commit');return result}catch(e){transactions.push('rollback');throw e}}};
const tracklist=axios.create({adapter:async c=>{posts.push({url:c.url,body:JSON.parse(c.data)});return {data:{},status:200,headers:{},config:c}}});const ctx={db,tracklist,authVerifier:()=>{throw new Error('unexpected auth invocation')}};
const cases={Apikey:{CreateApikey:{},GetApikeys:{apikeys:[]},RemoveApikey:{},UpdateApikey:{}},Player:{GetCurrentlyPlaying:{},GetPlaybackQueue:{},Play:undefined,Pause:undefined,Next:undefined,Previous:undefined,Seek:undefined,PlayFile:undefined,PlayDirectory:undefined,AddItemsToQueue:undefined},Playlist:{InsertDirectory:undefined,InsertFiles:undefined,StartPlaylist:undefined}};
for(const [group,names] of Object.entries(cases))for(const [name,expected] of Object.entries(names)){
 const mod=await import('../output/Rocksky.Xrpc.App.Rocksky.'+group+'.'+name+'/index.js');mod.register({method(n,c){assert.equal(typeof c.auth,'function');methods.set(n,c)}})(ctx)();
 const nsid='app.rocksky.'+group.toLowerCase()+'.'+name[0].toLowerCase()+name.slice(1);const handler=methods.get(nsid).handler;
 if(expected==='error'){await assert.rejects(handler({}),/Not implemented yet/);continue}
 const result=await handler({params:{items:['upload://a','unknown://c']},auth:{credentials:{did:'did:plc:test'}}});if(expected===undefined)assert.equal(result,undefined);else assert.deepEqual(result,{encoding:'application/json',body:expected});
}
assert.deepEqual(posts,[{url:'/tracklist.addTracks',body:{did:'did:plc:test',track_ids:['upload://a','unknown://c']}}]);assert.equal(queries.filter(x=>x==='queue_tracks').length,3);assert.equal(queries.filter(x=>x==='playlists').length,3);assert.equal(transactions.filter(x=>x==='commit').length,5);assert.equal(queries.filter(x=>typeof x==='object').length,0);
const queue=methods.get('app.rocksky.player.addItemsToQueue').handler;const before=transactions.length;await queue({params:{items:[]}});assert.equal(transactions.length,before);assert.equal(posts.length,1);
fail=true;const count=queries.length;await methods.get('app.rocksky.player.playFile').handler({});assert.equal(queries.length,count+1,'source catches DB errors as {}, so transient errors must not retry');assert.equal(transactions.at(-1),'rollback');
console.log('Source placeholders preserve authentication, empty/no-content/error responses, read-only transactions, queue grouping/posting and single-attempt failure behavior');
