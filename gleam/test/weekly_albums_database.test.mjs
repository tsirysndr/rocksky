import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { createTables } from './helpers/postgres.mjs';
import { register as tracks } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/charts/get_top_tracks.mjs';
import { register as artists } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/charts/get_top_artists.mjs';
import { register } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/album/get_albums.mjs';

test('album charts rank and count listeners within the requested dates', { skip: !process.env.GLEAM_TEST_PGHOST }, async () => {
  const client = new pg.Client({ host: process.env.GLEAM_TEST_PGHOST, port: Number(process.env.GLEAM_TEST_PGPORT), database: 'postgres' });
  await client.connect();
  try {
    await createTables(client, ['albums', 'scrobbles', 'tracks', 'artists']);
    await client.query(`
      INSERT INTO albums (xata_id,title,artist,sha256) VALUES ('a','Album A','Artist','a'),('b','Album B','Artist','b');
      INSERT INTO artists (xata_id,name,sha256) VALUES ('a','Artist A','a'),('b','Artist B','b');
      INSERT INTO tracks (xata_id,title,artist,album_artist,album,duration,sha256) VALUES ('a','Track A','Artist A','Artist A','Album A',120000,'a'),('b','Track B','Artist B','Artist B','Album B',120000,'b');
      INSERT INTO scrobbles (album_id,user_id,timestamp) VALUES
        ('a','u','2026-11-22'),('a','u','2026-11-22'),('a','v','2026-11-22'),
        ('b','u','2026-11-23'),('b','v','2026-11-24'),('a','u','2026-11-25');
    `);
    const methods = new Map();
    const cache = new Map();
    for (const handler of [register, tracks, artists]) handler({ method: (name, config) => { methods.set(name, config); } }, {
      read_db: { pool: client },
      redis: { get: async key => cache.get(key) ?? null, setEx: async (key, _, value) => { cache.set(key, value); } },
    });
    const call = async params => (await methods.get('app.rocksky.album.getAlbums').handler({ params, auth: {} })).body.albums;
    const weekly = await call({ startDate: '2026-11-23T00:00:00.000Z', endDate: '2026-11-24T00:00:00.000Z' });
    assert.deepEqual(weekly.map(album => [album.id, album.playCount, album.uniqueListeners]), [['b', 2, 2]]);
    await client.query(`INSERT INTO scrobbles (album_id,user_id,timestamp) SELECT 'a','u','2026-11-23' FROM generate_series(1,100)`);
    await client.query('UPDATE scrobbles SET track_id = album_id, artist_id = album_id');
    const fair = await call({ startDate: '2026-11-23T00:00:00.000Z', endDate: '2026-11-24T00:00:00.000Z', sortBy: 'listeners', limit: 1 });
    assert.deepEqual(fair.map(album => [album.id, album.uniqueListeners]), [['b', 2]]);
    for (const [name, key] of [['getTopTracks', 'tracks'], ['getTopArtists', 'artists']]) {
      const chart = (await methods.get('app.rocksky.charts.' + name).handler({params:{startDate:'2026-11-23T00:00:00.000Z',endDate:'2026-11-24T00:00:00.000Z',limit:1},auth:{}})).body[key];
      assert.equal(chart[0].id, 'b');
      assert.equal(chart[0].uniqueListeners, 2);
    }
    assert.equal((await call({}))[0].id, 'a');
    assert.deepEqual(await call({ startDate: '2027-01-01T00:00:00.000Z' }), []);
  } finally {
    await client.end();
  }
});
