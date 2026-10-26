import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as app from '../../build/dev/javascript/rocksky_feeds/rocksky_feeds.mjs';
import * as catalog from '../../build/dev/javascript/rocksky_feeds/rocksky_feeds/catalog.mjs';
import * as feed from '../../build/dev/javascript/rocksky_feeds/rocksky_feeds/feed.mjs';
import * as config from '../../build/dev/javascript/rocksky_feeds/rocksky_feeds/config.mjs';
import * as host from '../../build/dev/javascript/rocksky_feeds/rocksky_feeds/host_ffi.mjs';
import {Config,All,Genre,Row} from '../../build/dev/javascript/rocksky_feeds/rocksky_feeds/types.mjs';
import {Ok,Error as GleamError,toList} from '../../build/dev/javascript/gleam_stdlib/gleam.mjs';
import {Some,None} from '../../build/dev/javascript/gleam_stdlib/gleam/option.mjs';
const settings=new Config('feeds.example',8002,'postgres://unused','test-commit');
const base=`at://${catalog.publisher}/app.rocksky.feed.generator/`;
const request=(path,params={},query=async()=>new Ok(toList([])),authorization='',verify=async()=>false,method='GET')=>app.handle(settings,method,path,toList(Object.entries(params)),authorization,query,verify);
const skeleton=(params,query,auth,verify)=>request('/xrpc/app.rocksky.feed.getFeedSkeleton',params,query,auth,verify);

test('catalog preserves all 52 original algorithms, order, publisher and exact genre spellings',()=>{
 const source=new URL('../../../apps/feeds/src/algos/',import.meta.url);
 const module=fs.readFileSync(new URL('mod.ts',source),'utf8');
 const files=[...module.matchAll(/import \* as \w+ from "\.\/([^"]+)";/g)].map(m=>m[1]);
 const expected=files.map(file=>{const text=fs.readFileSync(new URL(file,source),'utf8');return {key:text.match(/export const rkey = "([^"]+)"/)[1],genre:text.match(/genreAlgorithm\("([^"]+)"/)?.[1]};});
 const algorithms=Array.from(catalog.algorithms());assert.equal(algorithms.length,52);
 assert.deepEqual(algorithms.map(a=>({key:catalog.key(a),genre:a.genre})),expected);
 for(const algorithm of algorithms)assert.equal(catalog.uri(algorithm),base+catalog.key(algorithm));
});

test('discovery, DID document, health, root and HTTP errors preserve public contracts',async()=>{
 const did=JSON.parse((await request('/.well-known/did.json')).body);
 assert.equal(did.id,'did:web:feeds.example');assert.deepEqual(did.service,[{id:'#rocksky_fg',type:'RockskyFeedGenerator',serviceEndpoint:'https://feeds.example'}]);
 const describe=JSON.parse((await request('/xrpc/app.rocksky.feed.describeFeedGenerator')).body);assert.equal(describe.feeds.length,52);assert.equal(describe.did,did.id);
 assert.deepEqual(JSON.parse((await request('/xrpc/_health')).body),{version:'test-commit'});
 assert.match((await request('/')).body,/Feed Generation service/);
 assert.equal((await request('/missing')).status,404);assert.equal((await request('/',{},undefined,'',undefined,'POST')).status,405);
});

test('request validation rejects malformed limits, offsets, URIs and unknown algorithms without querying',async()=>{
 let calls=0;const query=async()=>{calls++;return new Ok(toList([]));};
 for(const params of [{},{feed:'oops'},{feed:base+'all',limit:'0'},{feed:base+'all',limit:'1.5'},{feed:base+'all',offset:'-1'},{feed:base+'all',cursor:'bad'}])assert.equal((await skeleton(params,query)).status,400);
 for(const uri of [base+'unknown',base.replace(catalog.publisher,'did:plc:other')+'all',base.replace('feed.generator','song')+'all'])assert.equal(JSON.parse((await skeleton({feed:uri},query)).body).error,'UnsupportedAlgorithm');
 assert.equal(calls,0);
});

test('global skeleton preserves null URIs, timestamp cursors, default limit and ignored offset',async()=>{
 let query;
 const response=await skeleton({feed:base+'all',offset:'999'},async q=>{query=q;return new Ok(toList([new Row(new Some('at://song/1'),1234567),new Row(new None(),1234000)]));});
 assert.deepEqual(JSON.parse(response.body),{feed:[{scrobble:'at://song/1'},{scrobble:null}],cursor:'1234000'});
 assert.deepEqual(Array.from(query.parameters),['50']);assert.doesNotMatch(query.sql,/join|offset|uri is not null/i);
 const next=feed.query(new All(),30,new Some(1234000));assert.match(next.sql,/timestamp < to_timestamp\(\$1/);assert.deepEqual(Array.from(next.parameters),['1234000','30']);
});

test('genre query keeps bounded lateral scans and parameterizes genres and cursors',async()=>{
 const q=feed.query(new Genre('rnb','r&b'),30,new Some(1234000));
 assert.match(q.sql,/cross join lateral/i);assert.equal((q.sql.match(/limit \$\d/g)||[]).length,2);assert.match(q.sql,/recent.uri is not null/);assert.match(q.sql,/artist.genres @> array\[\$3\]/);assert.deepEqual(Array.from(q.parameters),['1234000','30','r&b','30']);
 let query;await skeleton({feed:base+'rnb',cursor:'invalid'},async q=>{query=q;return new Ok(toList([]));});assert.deepEqual(Array.from(query.parameters),['50','r&b','50']);
 assert.equal(host.cursor('123456xyz')[0],123456);assert.ok(host.cursor('invalid') instanceof None);
});

test('empty pages omit cursor, and query errors never expose backend details',async()=>{
 assert.deepEqual(JSON.parse((await skeleton({feed:base+'all'})).body),{feed:[]});
 const response=await skeleton({feed:base+'all'},async()=>new GleamError('secret database URL'));
 assert.equal(response.status,500);assert.deepEqual(JSON.parse(response.body),{error:'InternalServerError',message:'Feed query failed'});
});

test('optional authentication verifies Bearer tokens and falls back to public feeds',async()=>{
 const tokens=[];let queries=0;const verify=async token=>{tokens.push(token);return token==='valid';};const query=async()=>{queries++;return new Ok(toList([]));};
 for(const auth of ['', 'Basic value','Bearer invalid','Bearer valid'])assert.equal((await skeleton({feed:base+'all'},query,auth,verify)).status,200);
 assert.deepEqual(tokens,['invalid','valid']);assert.equal(queries,4);assert.equal(await host.verify('not-a-jwt'),false);
});

test('configuration prefers the replica and retains bounded PostgreSQL pool settings',()=>{
 const read=env=>config.load(key=>env[key]??'');
 const value=read({NODE_ENV:'production',ROCKSKY_FEEDGEN_DOMAIN:'feeds.example',XATA_POSTGRES_URL:'primary',XATA_READ_POSTGRES_URL:'replica'});
 assert.ok(value.isOk());assert.equal(value[0].database_url,'replica');assert.equal(value[0].port,8002);
 assert.equal(read({NODE_ENV:'production'}).isOk(),false);assert.equal(read({ROCKSKY_FEEDGEN_PORT:'70000'}).isOk(),false);
 assert.deepEqual(host.pool_options('replica'),{connectionString:'replica',max:20,idleTimeoutMillis:30000,connectionTimeoutMillis:5000,application_name:'rocksky-feeds:replica',statement_timeout:60000,idle_in_transaction_session_timeout:30000});
});

test('Drizzle adapter executes SQL objects with separate values and maps driver timestamps',async()=>{
 const q=feed.query(new All(),1,new None());let sent;
 const result=await host.query({db:{execute:async(statement)=>{sent=statement;return {rows:[{uri:'at://one',timestampMs:'1234.9'}]};}}},q);
 assert.equal(sent,q.statement);assert.deepEqual(Array.from(q.parameters),['1']);assert.equal(Array.from(result[0])[0].timestamp_ms,1234);
 const failed=await host.query({db:{execute:async()=>{throw new Error('credentials');}}},q);assert.equal(failed.isOk(),false);assert.equal(failed[0],'PostgreSQL query failed');
});

test('Fetch adapter suppresses HEAD bodies and catches rejected handlers',async()=>{
 const fetch=host.fetch_handler((method,path,params,auth)=>app.handle(settings,method,path,params,auth,async()=>new Ok(toList([])),async()=>false));
 const response=await fetch(new Request('http://localhost/xrpc/_health',{method:'HEAD'}));assert.equal(response.status,200);assert.equal(await response.text(),'');
 const fail=await host.fetch_handler(async()=>{throw new Error('secret');})(new Request('http://localhost/'));assert.equal(fail.status,500);assert.doesNotMatch(await fail.text(),/secret/);
});
