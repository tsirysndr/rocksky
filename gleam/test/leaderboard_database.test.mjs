import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { createTables } from './helpers/postgres.mjs';
import { register } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/charts/get_top_scrobblers.mjs';

test('Ranged leaderboard partitions live and rolled-up hours without gaps or duplicates', {skip:!process.env.GLEAM_TEST_PGHOST}, async()=>{
  const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
  try {
    await createTables(pool,['users','scrobbles']);
    await pool.query(`
      INSERT INTO users (xata_id,did,handle,display_name,avatar,is_bot) VALUES ('u','did:test:u','u.test','User','',false),('v','did:test:v','v.test','V','',false),('b','did:bot','bot.test','Bot','',true);
      INSERT INTO scrobbles (user_id,artist_id,track_id,timestamp) VALUES
        ('u','a','t1','2024-01-01 00:00'),('u','a','t2','2024-01-01 00:30'),
        ('u','a','t1','2024-01-01 01:00'),('u','b','t3','2024-01-01 01:30'),
        ('u','b','t3','2024-01-01 02:00'),('u','c','t4','2024-01-01 03:00'),
        ('v','a','t1','2024-01-01 01:00'),('v',NULL,NULL,'2024-01-01 02:00'),
        ('b','a','t1','2024-01-01 01:00');
      CREATE TEMP VIEW top_scrobblers_mv AS SELECT user_id,count(*)::int AS scrobbles,count(distinct artist_id)::int AS unique_artists,count(distinct track_id)::int AS unique_tracks FROM scrobbles GROUP BY user_id;
      CREATE TEMP TABLE user_hour_scrobbles_mv AS SELECT user_id,date_trunc('hour',timestamp) AS hour,count(*)::int AS scrobbles,
        array_agg(DISTINCT hashtext(artist_id)) FILTER (WHERE artist_id IS NOT NULL) AS artist_keys,
        array_agg(DISTINCT hashtext(track_id)) FILTER (WHERE track_id IS NOT NULL) AS track_keys
        FROM scrobbles WHERE timestamp < '2024-01-01 02:00' GROUP BY 1,2;
    `);
    let method; register({method:(n,c)=>method=c},{db:{pool},read_db:{pool}});
    const call=async params=>(await method.handler({params,auth:{}})).body.scrobblers;
    assert.deepEqual((await call({})).map(r=>[r.id,r.scrobbles]),[['u',6],['v',2]]);
    for(const [startDate,endDate] of [
      ['2024-01-01T00:00:00Z','2024-01-01T04:00:00Z'],
      ['2024-01-01T00:15:00Z','2024-01-01T02:30:00Z'],
      ['2024-01-01T00:00:00.001Z','2024-01-01T04:00:00Z'],
      ['2024-01-01T01:15:00Z','2024-01-01T01:45:00Z'],
      ['2024-01-01T02:00:00Z','2024-01-01T04:00:00Z'],
    ]) {
      const expected=(await pool.query(`SELECT s.user_id AS id,count(*)::int AS scrobbles,count(distinct hashtext(artist_id))::int AS artists,count(distinct hashtext(track_id))::int AS tracks
        FROM scrobbles s JOIN users u ON u.xata_id=s.user_id WHERE u.is_bot=false AND timestamp >= $1 AND timestamp <= $2 GROUP BY s.user_id ORDER BY scrobbles DESC,s.user_id`,[startDate,endDate])).rows;
      const actual=await call({startDate,endDate});
      assert.deepEqual(actual.map(r=>({id:r.id,scrobbles:r.scrobbles,artists:r.uniqueArtists,tracks:r.uniqueTracks})),expected);
    }
    assert.equal((await call({startDate:'2024-01-01',endDate:'2024-01-02',limit:1,offset:1}))[0].id,'v');
    await pool.query('TRUNCATE user_hour_scrobbles_mv');
    assert.equal((await call({startDate:'2023-12-31',endDate:'2024-01-02'}))[0].scrobbles,6);
  } finally { await pool.end(); }
});
