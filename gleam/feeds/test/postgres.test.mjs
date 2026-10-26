import {test} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {query as build,encode} from '../../build/dev/javascript/rocksky_feeds/rocksky_feeds/feed.mjs';
import {connection} from '../../build/dev/javascript/rocksky_feeds/rocksky_feeds/drizzle_ffi.mjs';
import {query} from '../../build/dev/javascript/rocksky_feeds/rocksky_feeds/host_ffi.mjs';
import {All,Genre} from '../../build/dev/javascript/rocksky_feeds/rocksky_feeds/types.mjs';
import {Some,None} from '../../build/dev/javascript/gleam_stdlib/gleam/option.mjs';

test('PostgreSQL executes bounded genre and global pagination against temporary tables',{skip:!process.env.FEEDS_TEST_DATABASE_URL},async()=>{
 const client=new pg.Client({connectionString:process.env.FEEDS_TEST_DATABASE_URL});await client.connect();
 try{
  await client.query('BEGIN');await client.query("SET LOCAL TIME ZONE 'UTC'");
  await client.query('CREATE TEMP TABLE artists (xata_id text primary key, genres text[]); CREATE TEMP TABLE scrobbles (artist_id text, uri text, timestamp timestamp not null)');
  await client.query("INSERT INTO artists VALUES ('a', ARRAY['r&b','jazz']), ('b', ARRAY['jazz']), ('c',ARRAY['rock'])");
  await client.query("INSERT INTO scrobbles VALUES ('a','at://a/3',to_timestamp(3)),('a','at://a/2',to_timestamp(2)),('b','at://b/4',to_timestamp(4)),('c','at://c/5',to_timestamp(5)),('a',null,to_timestamp(6)),('missing','at://orphan/7',to_timestamp(7))");
  const page=async(algo,cursor=new None())=>{const result=await query(connection(client),build(algo,2,cursor));assert.ok(result.isOk(),result[0]);return JSON.parse(encode(result[0]));};
  assert.deepEqual(await page(new Genre('jazz','jazz')),{feed:[{scrobble:'at://b/4'},{scrobble:'at://a/3'}],cursor:'3000'});
  assert.deepEqual(await page(new Genre('jazz','jazz'),new Some(3000)),{feed:[{scrobble:'at://a/2'}],cursor:'2000'});
  assert.deepEqual(await page(new Genre('rnb','r&b')),{feed:[{scrobble:'at://a/3'},{scrobble:'at://a/2'}],cursor:'2000'});
  assert.deepEqual(await page(new Genre('empty','missing')),{feed:[]});
  assert.deepEqual(await page(new Genre('attack',"jazz'] OR true --")),{feed:[]});
  assert.deepEqual(await page(new All()),{feed:[{scrobble:'at://orphan/7'},{scrobble:null}],cursor:'6000'});
  assert.deepEqual(await page(new All(),new Some(6000)),{feed:[{scrobble:'at://c/5'},{scrobble:'at://b/4'}],cursor:'4000'});
 }finally{await client.query('ROLLBACK');await client.end();}
});
