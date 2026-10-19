import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toList, Ok, Error as GError } from '../build/dev/javascript/rocksky_api/gleam.mjs';
import * as search from '../build/dev/javascript/rocksky_api/rocksky_api/typesense/search.mjs';
import * as schema from '../build/dev/javascript/rocksky_api/rocksky_api/typesense/schema.mjs';
import * as retry from '../build/dev/javascript/rocksky_api/rocksky_api/typesense/retry.mjs';
import * as library from '../build/dev/javascript/rocksky_api/rocksky_api/typesense/library.mjs';
import { Js } from '../build/dev/javascript/rocksky_api/rocksky_api/error.mjs';
import { register } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/feed/search.mjs';
test('Federated search preserves collection order, open documents and partial failures', async()=>{
 let sent;
 const client={multiSearch:{perform:async p=>{sent=p;return {results:[{found:9,hits:[{document:{id:'a',extra:{x:1},_federation:'old'}}]},{error:'offline'}, {found:2,hits:[{document:{id:'t'}}]}, {found:0}, {found:1,hits:[{document:{id:'p'}}]}]};}}};
 const response=await search.federated_search(client,'hello',7);assert.ok(response instanceof Ok);
 const body=search.encode(response[0]);assert.equal(body.estimatedTotalHits,12);assert.equal(body.limit,35);
 assert.deepEqual(body.hits.map(x=>x._federation.indexUid),['albums','tracks','playlists']);assert.deepEqual(body.hits[0].extra,{x:1});
 assert.equal(sent.searches[2].query_by,'title,artist,albumArtist,album,composer');assert.equal(sent.searches[0].per_page,7);
 const methods=new Map();register({method:(n,c)=>methods.set(n,c)},{typesense:client});
 await methods.get('app.rocksky.feed.search').handler({params:{query:'x',size:500}});assert.equal(sent.searches[0].per_page,100);
 await methods.get('app.rocksky.feed.search').handler({params:{query:'x',size:0}});assert.equal(sent.searches[0].per_page,20);
});
test('Typesense retries only transient failures and collection creation preserves schemas',async()=>{
 assert.equal(retry.is_transient({cause:{code:'ECONNRESET'}}),true);assert.equal(retry.is_transient({httpStatus:503}),true);assert.equal(retry.is_transient({httpStatus:429}),false);
 let calls=0;
 let result=await retry.with_options(async()=>++calls<3?new GError(new Js({code:'ETIMEDOUT'})):new Ok(42),3,0);assert.ok(result instanceof Ok);assert.equal(calls,3);
 calls=0;result=await retry.with_options(async()=>{calls++;return new GError(new Js({httpStatus:400}));},3,0);assert.ok(result instanceof GError);assert.equal(calls,1);
 const created=[],deleted=[];
 const client={collections:name=>name?{retrieve:async()=>{throw {httpStatus:404};},delete:async()=>{deleted.push(name);throw {httpStatus:404};}}:{create:async s=>{if(s.fields.some(f=>f.name==='.*')) assert.equal(s.fields.find(f=>f.name==='.*').optional,true);created.push(s);return s;}}};
 assert.ok(await schema.ensure_collection(client) instanceof Ok);assert.equal(created[0].default_sorting_field,'uploaded_at');assert.equal(created[0].fields.find(x=>x.name==='user_id').facet,true);
 assert.ok(await schema.ensure_search_collections(client) instanceof Ok);assert.equal(created.length,6);
 assert.ok(await schema.recreate_search_collections(client) instanceof Ok);assert.deepEqual(deleted,['albums','artists','tracks','users','playlists']);
});
test('Library search scopes user, paginates and preserves nullable metadata',async()=>{
 let sent,upsert;
 const doc={id:'u',user_id:'owner',track_id:'t',title:'Song',artist:'Artist',album:'Album',album_artist:'Artist',duration:100,r2_key:'r',mime_type:'audio/flac',file_size:99,uploaded_at:1700000000000};
 const client={collections:name=>({documents:id=>({search:async p=>{sent=p;return {hits:[{document:doc}]};},upsert:async d=>{upsert=d;return d;},delete:async()=>{throw {httpStatus:404};}})})};
 const result=await library.search_library_tracks(client,'','owner',500,400);assert.ok(result instanceof Ok);
 assert.equal(sent.per_page,200);assert.equal(sent.page,3);assert.equal(sent.filter_by,'user_id:=owner');assert.equal(sent.q,'*');
 const document=[...result[0]][0],hit=library.encode_hit(document);assert.equal(hit.track.genre,null);assert.equal(hit.upload.uploadedAt,'2023-11-14T22:13:20.000Z');
 assert.ok(await library.index_library_track(client,document) instanceof Ok);assert.deepEqual(upsert,doc);
 assert.ok(await library.remove_library_track(client,'u') instanceof Ok);
});
test('Missing search collections are created before retrying a user import',async()=>{
 const {None,Some}=await import('../build/dev/javascript/gleam_stdlib/gleam/option.mjs');
 const {User}=await import('../build/dev/javascript/rocksky_api/rocksky_api/schema/users.mjs');
 const {from_unix_seconds}=await import('../build/dev/javascript/gleam_time/gleam/time/timestamp.mjs');
 const none=new None(),time=from_unix_seconds(0),user=new User('u','did:u',new Some('User'),'u.test','',false,none,none,time,time,none);
 const existing=new Set(),created=[];let imports=0;
 const client={collections:name=>name?{
  retrieve:async()=>{if(!existing.has(name))throw {httpStatus:404};return {};},
  documents:()=>({import:async()=>{imports++;if(!existing.has(name))throw {httpStatus:404};return [{success:true}];}})
 }:{create:async s=>{created.push(s.name);existing.add(s.name);return s;}}};
 assert.ok(await search.index_users(client,toList([user])) instanceof Ok);
 assert.equal(imports,2);assert.deepEqual(created,['albums','artists','tracks','users','playlists']);
 assert.ok(await search.index_users(client,toList([user])) instanceof Ok);assert.equal(created.length,5);
});
test('Collection setup preserves authentication failures and tolerates concurrent creation',async()=>{
 let creates=0;
 const unauthorized={collections:name=>name?{retrieve:async()=>{throw {httpStatus:401};}}:{create:async()=>{creates++;}}};
 assert.ok(await schema.ensure_search_collections(unauthorized) instanceof GError);assert.equal(creates,0);
 const seen=new Set();
 const racing={collections:name=>name?{retrieve:async()=>{if(!seen.has(name)){seen.add(name);throw {httpStatus:404};}return {};}}:{create:async()=>{throw {httpStatus:409};}}};
 assert.ok(await schema.ensure_search_collections(racing) instanceof Ok);
});

test('Nullable user display names survive row decoding and Typesense indexing',async()=>{
 const {run}=await import('../build/dev/javascript/gleam_stdlib/gleam/dynamic/decode.mjs');
 const users=await import('../build/dev/javascript/rocksky_api/rocksky_api/schema/users.mjs');
 for(const name of [null,'Alice']) {
  const decoded=run({xata_id:'u',did:'did:u',display_name:name,handle:'u.test',avatar:'',is_bot:false,
   bot_flagged_at:null,bot_reason:null,xata_createdat:new Date(0),xata_updatedat:new Date(0),xata_version:null},users.decoder());
  assert.ok(decoded instanceof Ok,JSON.stringify(decoded));
  assert.equal(users.to_json(decoded[0]).displayName,name);
  let documents;
  const client={collections:()=>({documents:()=>({import:async rows=>{documents=rows;return [{success:true}];}})})};
  assert.ok(await search.index_users(client,toList([decoded[0]])) instanceof Ok);
  assert.equal(documents[0].displayName,name);
 }
});

test('Typesense SDK makes one attempt on 503; Gleam owns bounded retries', async () => {
 const { createServer } = await import('node:http');
 const { once } = await import('node:events');
 const { client } = await import('../build/dev/javascript/rocksky_api/rocksky_api/node/typesense_ffi.mjs');
 let attempts = 0;
 const server = createServer((_req, res) => { attempts++; res.writeHead(503, {'content-type':'application/json'}); res.end('{"message":"Not Ready or Lagging"}'); });
 server.listen(0, '127.0.0.1');
 await once(server, 'listening');
 try {
  const sdk = client('127.0.0.1', server.address().port, 'http', 'test', 2);
  await assert.rejects(sdk.collections('users').retrieve(), /Not Ready or Lagging/);
  assert.equal(attempts, 1);
 } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
