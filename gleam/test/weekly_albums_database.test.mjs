import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { createTables } from './helpers/postgres.mjs';
import { register } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/album/get_albums.mjs';

test('album charts rank and count listeners within the requested dates', { skip: !process.env.GLEAM_TEST_PGHOST }, async () => {
  const client = new pg.Client({ host: process.env.GLEAM_TEST_PGHOST, port: Number(process.env.GLEAM_TEST_PGPORT), database: 'postgres' });
  await client.connect();
  try {
    await createTables(client, ['albums', 'scrobbles']);
    await client.query(`
      INSERT INTO albums (xata_id,title,artist,sha256) VALUES ('a','Album A','Artist','a'),('b','Album B','Artist','b');
      INSERT INTO scrobbles (album_id,user_id,timestamp) VALUES
        ('a','u','2026-11-22'),('a','u','2026-11-22'),('a','v','2026-11-22'),
        ('b','u','2026-11-23'),('b','v','2026-11-24'),('a','u','2026-11-25');
    `);
    let method;
    const cache = new Map();
    register({ method: (_, config) => { method = config; } }, {
      read_db: { pool: client },
      redis: { get: async key => cache.get(key) ?? null, setEx: async (key, _, value) => { cache.set(key, value); } },
    });
    const call = async params => (await method.handler({ params, auth: {} })).body.albums;
    const weekly = await call({ startDate: '2026-11-23T00:00:00.000Z', endDate: '2026-11-24T00:00:00.000Z' });
    assert.deepEqual(weekly.map(album => [album.id, album.playCount, album.uniqueListeners]), [['b', 2, 2]]);
    assert.equal((await call({}))[0].id, 'a');
    assert.deepEqual(await call({ startDate: '2027-01-01T00:00:00.000Z' }), []);
  } finally {
    await client.end();
  }
});
