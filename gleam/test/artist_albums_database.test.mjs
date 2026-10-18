import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { createTables } from './helpers/postgres.mjs';
import { register } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/artist/get_artist_albums.mjs';

test('artist albums restrict aggregation, preserve counts and short-circuit empty artists',
  { skip: !process.env.GLEAM_TEST_DATABASE_URL }, async () => {
    const client = new pg.Client({ connectionString: process.env.GLEAM_TEST_DATABASE_URL });
    await client.connect();
    try {
      await createTables(client, ['artists', 'albums', 'artist_albums', 'scrobbles']);
      await client.query(`
        INSERT INTO artists (xata_id,name,sha256,uri) VALUES
          ('artist','Artist','artist','at://artist'), ('empty','Empty','empty','at://empty'),
          ('null-link','Null link','null-link','at://null-link');
        INSERT INTO albums (xata_id,title,artist,sha256,uri) VALUES
          ('played','Played','Artist','played','at://played'),
          ('unplayed','Unplayed','Artist','unplayed','at://unplayed'),
          ('unrelated','Unrelated','Someone else','unrelated','at://unrelated');
        ALTER TABLE artist_albums ALTER COLUMN album_id DROP NOT NULL;
        INSERT INTO artist_albums (artist_id,album_id) VALUES
          ('artist','played'), ('artist','played'), ('artist','unplayed'), ('null-link',NULL);
        INSERT INTO scrobbles (album_id,user_id) VALUES
          ('played','u1'), ('played','u1'), ('played','u2'), ('unrelated','u3'), (NULL,'u4');
      `);
      const queries = [];
      const pool = { query: (...args) => {
        queries.push({ sql: typeof args[0] === 'string' ? args[0] : args[0].text, params: args[1] });
        return client.query(...args);
      }};
      let handler;
      register({ method: (_name, config) => { handler = config.handler; } }, { read_db: { pool } });
      const call = uri => handler({ params: { uri }, auth: {} });
      const result = (await call('at://artist')).body.albums;
      assert.deepEqual(result.map(row => row.id).sort(), ['played', 'unplayed']);
      assert.equal(result.find(row => row.id === 'played').playCount, 3);
      assert.equal(result.find(row => row.id === 'played').uniqueListeners, 2);
      assert.equal(result.find(row => row.id === 'unplayed').playCount, 0);
      assert.equal(result.find(row => row.id === 'unplayed').uniqueListeners, 0);
      // Regression guard: output correctness alone would miss the global scan.
      const aggregate = queries.find(query => query.sql.includes('count(*)'));
      assert.match(aggregate.sql, /from "scrobbles" where "scrobbles"\."album_id" in \([^)]*\) group by/);
      assert.ok(aggregate.params.includes('played'));
      assert.ok(aggregate.params.includes('unplayed'));
      assert.ok(!aggregate.params.includes('unrelated'));
      for (const [uri, expectedQueries] of [['at://missing', 1], ['at://empty', 2], ['at://null-link', 2]]) {
        queries.length = 0;
        assert.deepEqual((await call(uri)).body.albums, []);
        assert.equal(queries.length, expectedQueries);
        assert.ok(queries.every(query => !query.sql.includes('count(*)')));
      }
    } finally { await client.end(); }
  });
