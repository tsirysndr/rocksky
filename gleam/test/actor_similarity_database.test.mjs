import assert from 'node:assert/strict';
import {test} from 'node:test';
import pg from 'pg';
import {createTables} from './helpers/postgres.mjs';
import {Ok} from '../build/dev/javascript/rocksky_api/gleam.mjs';
import * as compat from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/actor/get_actor_compatibility.mjs';
import * as neighbours from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/actor/get_actor_neighbours.mjs';
import {encode_actor_compatibility_view_basic as encode} from '../build/dev/javascript/rocksky_api/rocksky_api/lexicon/models.mjs';
import {describe} from '../build/dev/javascript/rocksky_api/rocksky_api/error.mjs';
test('Compatibility and neighbours preserve ranking, shared artists and replica reads', {skip:!process.env.GLEAM_TEST_PGHOST},async()=>{
 const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
 try {
 await createTables(pool,['users','artists','scrobbles']);await pool.query('CREATE TEMP TABLE user_artists_mv (user_id text,artist_id text,play_count int)');
 await pool.query("INSERT INTO users(xata_id,did,handle,display_name,avatar) VALUES ('u','did:u','u.test','U',''),('v','did:v','v.test','V',''),('w','did:w','w.test','W','')");
 for(let i=0;i<8;i++)await pool.query('INSERT INTO artists(xata_id,name,sha256) VALUES ($1,$2,$1)',['a'+i,'Artist '+i]);
 await pool.query("INSERT INTO artists(xata_id,name,sha256) VALUES ('various','Various Artists','various')");
 for(const [user,ids] of [['u',[0,1,2,3,4,5,6]],['v',[0,1,2,3,4,5,7]],['w',[0,1]]]){
  for(const id of ids){const plays=id+1;await pool.query('INSERT INTO user_artists_mv VALUES ($1,$2,$3)',[user,'a'+id,plays]);await pool.query('INSERT INTO scrobbles(user_id,artist_id,timestamp) SELECT $1,$2,now() FROM generate_series(1,$3)',[user,'a'+id,plays]);}
  await pool.query("INSERT INTO scrobbles(user_id,artist_id,timestamp) VALUES ($1,'various',now())",[user]);
 }
 const ctx={read_db:{pool},db:{pool:{query(){throw new Error('must use replica');}}}};
 let result=await compat.retrieve(ctx,'did:u','v.test');assert.ok(result instanceof Ok,result instanceof Ok?'':describe(result[0]));const view=encode(result[0]);assert.equal(view.sharedArtists,6);assert.equal(view.compatibilityPercentage,75);assert.equal(view.compatibilityLevel,8);assert.equal(view.user1ArtistCount,7);assert.equal(view.topSharedArtistNames[0],'Artist 5');
 result=await neighbours.retrieve(ctx,'u.test');assert.ok(result instanceof Ok,result instanceof Ok?'':describe(result[0]));const rows=[...result[0]].map(neighbours.encode);assert.deepEqual(rows.map(r=>r.id),['v','w']);assert.equal(rows[0].sharedArtistsCount,6);assert.equal(rows[0].similarityScore,6/7);assert.deepEqual(rows[0].topSharedArtistNames,['Artist 5','Artist 4','Artist 3','Artist 2','Artist 1']);assert.equal(rows[0].topSharedArtistsDetails[0].picture,null);
 } finally {await pool.end();}
});
