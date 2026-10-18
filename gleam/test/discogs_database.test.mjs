import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import axios from 'axios';
import { createTables } from './helpers/postgres.mjs';
import { Ok } from '../build/dev/javascript/rocksky_api/gleam.mjs';
import { Some, None } from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';
import * as enrichment from '../build/dev/javascript/rocksky_api/rocksky_api/lib/discogs_enrichment.mjs';
import * as relation from '../build/dev/javascript/rocksky_api/rocksky_api/lib/discogs_relation.mjs';
test('Discogs relation parsing preserves printed disc/track positions and durations',()=>{
 for(const [input,expected] of [['7',[0,7]],['2-04',[2,4]],['C2',[2,2]],['B3a',[1,3]],['',[0,0]],['1.02a',[1,2]]])assert.deepEqual(relation.parse_position(input),expected);
 assert.equal(relation.parse_duration_ms('1:02:03'),3723000);assert.equal(relation.parse_duration_ms('3:12'),192000);assert.equal(relation.parse_duration_ms('invalid'),0);
});
test('Discogs enrichment stores relational metadata, caches misses and retries incomplete releases', {skip:!process.env.GLEAM_TEST_PGHOST},async()=>{
 const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
 try {
 await createTables(pool,['albums','tracks','discogs_releases','discogs_searches','discogs_credits','discogs_release_artists','discogs_release_labels','discogs_identifiers','discogs_tracks','discogs_masters']);
 await pool.query('CREATE UNIQUE INDEX ON discogs_releases(discogs_id)');await pool.query('CREATE UNIQUE INDEX ON discogs_searches(sha256)');await pool.query('CREATE UNIQUE INDEX ON discogs_masters(discogs_id)');
 const sha=enrichment.discogs_search_key('Artist','Album');await pool.query("INSERT INTO albums(xata_id,title,artist,sha256) VALUES ('a','Album','Artist',$1)",[sha]);
 let calls=[],mode='matched';
 const ctx={db:{pool},discogs:axios.create({adapter:async config=>{
 calls.push(config.url);if(mode==='unavailable')throw new Error('offline');let data;
 if(config.url==='/enrich')data={track:mode==='miss'?null:{title:'Song',artist:'Artist',album:'Album',discogsReleaseId:123,discogsMasterId:456,year:2000,credits:[{name:'  Producer ',role:' Production '}],genres:['Jazz']},matches:[{id:123,artist:'Artist',album:'Album',score:92.5}]};
 else if(config.url==='/releases/123')data={id:123,title:'Album',artists:[{id:1,name:' Artist '}],labels:[{name:' Label ',catno:' ABC '}],companies:[{name:'Plant',entity_type_name:'Pressed By'}],identifiers:[{type:' Barcode ',value:' 123 '}],tracklist:[{title:' Song ',position:'C2',duration:'3:12'}]};
 else data={id:456,title:' Album ',year:2000,artists:[{name:'Artist',join:'&'},{name:'Guest'}]};
 return {status:200,headers:{},data,config};}})};
 let result=await enrichment.enrich_album_with_discogs(ctx,'Artist','Album',new None());assert.ok(result instanceof Ok,JSON.stringify(result));assert.ok(result[0] instanceof enrichment.Matched);
 assert.deepEqual(calls,['/enrich','/releases/123','/masters/456']);
 const release=result[0].release;assert.equal((await pool.query('SELECT discogs_release_id FROM albums')).rows[0].discogs_release_id,release.id);
 assert.deepEqual((await pool.query('SELECT title,duration_ms,disc_number,track_number FROM discogs_tracks')).rows[0],{title:'Song',duration_ms:192000,disc_number:2,track_number:2});
 assert.equal((await pool.query('SELECT artist FROM discogs_masters')).rows[0].artist,'Artist & Guest');
 assert.equal((await pool.query('SELECT name FROM discogs_credits')).rows[0].name,'Producer');
 await enrichment.enrich_album_with_discogs(ctx,'Artist','Album',new None());assert.equal(calls.length,3);
 await pool.query('UPDATE discogs_releases SET credits_fetched_at=NULL');await enrichment.enrich_album_with_discogs(ctx,'Artist','Album',new None());assert.equal(calls.length,5);assert.equal((await pool.query('SELECT count(*) FROM discogs_credits')).rows[0].count,1);
 mode='miss';result=await enrichment.enrich_album_with_discogs(ctx,'Unknown','Other',new None());assert.ok(result[0] instanceof enrichment.Missed);const before=calls.length;await enrichment.enrich_album_with_discogs(ctx,'Unknown','Other',new None());assert.equal(calls.length,before);
 await pool.query("UPDATE discogs_searches SET searched_at=now()-interval '31 days' WHERE artist='Unknown'");await enrichment.enrich_album_with_discogs(ctx,'Unknown','Other',new None());assert.equal(calls.length,before+1);
 mode='unavailable';result=await enrichment.enrich_album_with_discogs(ctx,'Offline','Album',new None());assert.ok(result[0] instanceof enrichment.Unavailable);assert.equal((await pool.query("SELECT count(*) FROM discogs_searches WHERE artist='Offline'")).rows[0].count,0);
 } finally {await pool.end();}
});
