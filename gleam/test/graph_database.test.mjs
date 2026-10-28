import assert from 'node:assert/strict';
import {test} from 'node:test';
import pg from 'pg';
import {createTables} from './helpers/postgres.mjs';
import {register as followers} from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/graph/get_followers.mjs';
import {register as follows} from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/graph/get_follows.mjs';
import {page} from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/graph/queries.mjs';
import {Some,None} from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';
import {Ok,toList} from '../build/dev/javascript/rocksky_api/gleam.mjs';
test('Graph pages use one connection and preserve filtered counts and cursors',{skip:!process.env.GLEAM_TEST_PGHOST},async()=>{
 const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
 try{
  await createTables(pool,['users','follows']);
  await pool.query("INSERT INTO users(xata_id,did,handle,avatar) VALUES ('a','did:a','a.test',''),('b','did:b','b.test',''),('c','did:c','c.test','')");
  await pool.query("INSERT INTO follows(uri,follower_did,subject_did,xata_createdat) VALUES ('at://b/a','did:b','did:a','2026-01-02'),('at://c/a','did:c','did:a','2026-01-01'),('at://b/c','did:b','did:c','2026-01-03')");
  const methods=new Map(),ctx={db:{pool}};for(const register of [followers,follows])register({method:(n,c)=>methods.set(n,c.handler)},ctx);
  const original=pool.query.bind(pool);let reads=0;pool.query=(...args)=>{reads++;return original(...args);};
  const call=async(name,params)=>{reads=0;const response=await methods.get('app.rocksky.graph.'+name)({params});assert.equal(reads,1);return response.body;};
  const first=await call('getFollowers',{actor:'did:a',limit:1});assert.equal(first.subject.did,'did:a');assert.equal(first.count,2);assert.deepEqual(first.followers.map(u=>u.did),['did:b']);assert.equal(first.cursor,String(Date.parse('2026-01-02Z')));
  const next=await call('getFollowers',{actor:'did:a',limit:1,cursor:first.cursor});assert.equal(next.count,2);assert.deepEqual(next.followers.map(u=>u.did),['did:c']);
  const filtered=await call('getFollowers',{actor:'did:a',limit:1,dids:['did:c']});assert.equal(filtered.count,1);assert.deepEqual(filtered.followers.map(u=>u.did),['did:c']);
  const absent=await call('getFollowers',{actor:'did:a',limit:1,dids:['did:missing']});assert.equal(absent.subject.did,'did:a');assert.equal(absent.count,0);assert.deepEqual(absent.followers,[]);assert.equal(absent.cursor,undefined);
  const missing=await call('getFollowers',{actor:'did:missing'});assert.deepEqual(missing.subject,{});assert.deepEqual(missing.followers,[]);
  const following=await call('getFollows',{actor:'did:b',limit:1});assert.equal(following.count,2);assert.deepEqual(following.follows.map(u=>u.did),['did:c']);
  reads=0;const known=await page(ctx,'did:a',10,new None(),toList([]),false,new Some('did:b'));assert.ok(known instanceof Ok);assert.equal(reads,1);assert.deepEqual(known[0][1].toArray().map(p=>p.did[0]),['did:c']);
 }finally{await pool.end();}
});
