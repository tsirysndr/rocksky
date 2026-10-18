import assert from 'node:assert/strict';
import { test } from 'node:test';
import { register } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/song/get_song.mjs';
import { Credentials } from '../build/dev/javascript/rocksky_api/rocksky_api/node/xrpc_server.mjs';
import { Some, None } from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';

const dates = { xata_createdat: '2024-01-01 00:00:00', xata_updatedat: '2024-01-02 00:00:00' };
const track = {
  ...dates, xata_id: 'track', title: 'Song', artist: 'Artist, Guest, Artist',
  album_artist: 'Artist', album: 'Album', duration: 123000, sha256: 'sha',
  uri: 'at://track', album_uri: 'at://album', artist_uri: 'at://artist',
  mb_id: ' mbid ', isrc: '  ', bpm: 120.5, lyrics: 'Lyrics',
  spotify_link: 'https://open.spotify.com/track/spotify',
};
const artists = ['Guest', 'Artist'].map(name => ({ ...dates, xata_id: name, name, sha256: name, genres: ['rock'] }));

function endpoint({ missing = false, noHistory = false } = {}) {
  const queries = [];
  function pool(source) {
    return { async query(config, params) {
      const sql = config.text;
      queries.push({ source, sql, params });
      let rows;
      if (sql.includes('from "tracks" left join "artists"')) rows = missing ? [] : [{tracks:track, artists:noHistory ? {} : artists[1]}];
      else if (sql.includes('from "artists"')) rows = noHistory ? [] : artists.map(a=>({artists:a}));
      else if (sql.includes('from "loved_tracks"')) rows = noHistory ? [] : [
        {tracks:{sha256:'sha'},users:{did:'did:test:one'}}, {tracks:{sha256:'sha'},users:{did:'did:test:two'}}];
      else if (sql.includes('count(*)')) rows = [{count:noHistory ? '0' : sql.includes('"user_tracks"') ? '2' : '3'}];
      else if (sql.includes('from "user_tracks"')) rows = [{user_tracks:{track_id:'track'}}];
      else if (sql.includes('from "scrobbles"')) rows = noHistory ? [] : [{users:{handle:'two.test',avatar:'two.png'},scrobbles:{timestamp:'2024-01-01 00:00:00'}}];
      else if (sql.includes('from "tracks"')) rows = [{tracks:track}];
      else throw new Error(`Unexpected SQL: ${sql}`);
      const fromTable = sql.match(/from "([^" ]+)"/)[1];
      const fields=sql.slice(7,sql.indexOf(' from ')).split(', ');
      rows=rows.map(row=>fields.map(field=>{
        if (field.startsWith('count(*)')) return row.count;
        const parts=[...field.matchAll(/"([^" ]+)"/g)].map(m=>m[1]);
        const [table,column]=parts.length===1 ? [fromTable,parts[0]] : parts;
        return row[table]?.[column] ?? null;
      }));
      return { rows, rowCount: rows.length };
    } };
  }

  let config;
  register({ method(nsid, value) { assert.equal(nsid, 'app.rocksky.song.getSong'); config = value; } }, {
    db: { pool: pool('primary') }, read_db: { pool: pool('replica') },
  });
  return { queries, config, call: (params, did) => config.handler({ params, auth: did ? {
    credentials: new Credentials(new Some(did), new None(), new None()),
  } : {} }) };
}

test('rejects missing and whitespace identifiers before accessing the database', async () => {
  for (const params of [{}, { uri: ' ', mbid: '\t', isrc: '', spotifyId: '\n' }]) {
    const e = endpoint();
    const result = await e.call(params);
    assert.equal(result.status, 400);
    assert.equal(result.message, 'getSong requires one of: uri, mbid, isrc, spotifyId');
    assert.equal(e.queries.length, 0);
  }
});

test('supports each trimmed identifier and parameterizes combined OR lookup', async () => {
  for (const [key, column, value] of [
    ['uri', '"tracks"."uri"', 'at://track'], ['mbid', '"tracks"."mb_id"', 'mbid'],
    ['isrc', '"tracks"."isrc"', 'isrc'], ['spotifyId', '"tracks"."spotify_link"', 'https://open.spotify.com/track/spotify'],
  ]) {
    const e = endpoint();
    await e.call({ [key]: ` ${key === 'spotifyId' ? 'spotify' : value} ` });
    const lookup = e.queries.find(q => q.sql.includes('from "tracks" left join "artists"'));
    assert.ok(lookup.sql.includes(column));
    assert.ok(lookup.params.includes(value));
    assert.equal(e.queries.filter(q => q.sql.startsWith('select "track_id"')).length, key === 'uri' ? 1 : 0);
  }
  const e = endpoint();
  const injected = "a' OR 1=1 --";
  await e.call({ uri: ' at://user/track ', mbid: injected, isrc: 'isrc', spotifyId: 'spotify' });
  const lookup = e.queries[1];
  assert.deepEqual(lookup.params, ['track', 'at://user/track', injected, 'isrc', 'https://open.spotify.com/track/spotify', 1]);
  assert.match(lookup.sql, /"tracks"\."xata_id" = \$1 or "tracks"\."uri" = \$2/);
  assert.ok(!lookup.sql.includes(injected));
});

test('returns typed metadata, ordered artist credits, counts and caller likes', async () => {
  const e = endpoint();
  const { body } = await e.call({ uri: 'at://user/track' }, 'did:test:one');
  assert.equal(body.id, 'track');
  assert.equal(body.mbId, 'mbid');
  assert.ok(!('isrc' in body));
  assert.deepEqual(body.artists.map(a => a.name), ['Artist', 'Guest', 'Artist']);
  assert.deepEqual(body.tags, ['rock']);
  assert.equal(body.uniqueListeners, 2);
  assert.equal(body.playCount, 3);
  assert.equal(body.likesCount, 2);
  assert.equal(body.liked, true);
  assert.equal(body.bpm, 120.5);
  assert.equal(body.lyrics, 'Lyrics');
  assert.equal(body.albumUri, 'at://album');
  assert.equal(body.createdAt, '2024-01-01T00:00:00.000Z');
  assert.equal(body.firstScrobble.handle, 'two.test');
  for (const q of e.queries) {
    assert.equal(q.source, q.sql.includes('from "loved_tracks"') || q.sql.startsWith('select "xata_id", "sha256"') ? 'primary' : 'replica');
  }
  assert.equal((await e.call({ mbid: 'mbid' })).body.liked, false);
});

test('allows anonymous auth and songs without history or artist metadata', async () => {
  const e = endpoint({ noHistory: true });
  assert.deepEqual(await e.config.auth({ req: { headers: {} } }), {});
  const { body } = await e.call({ mbid: 'mbid' });
  assert.deepEqual(body.tags, []);
  assert.deepEqual(body.artists, []);
  assert.equal(body.playCount, 0);
  assert.equal(body.uniqueListeners, 0);
  assert.equal(body.likesCount, 0);
  assert.equal(body.liked, false);
  assert.ok(!('firstScrobble' in body));
});

test('propagates NotFound without retry or an empty success response', async () => {
  const e = endpoint({ missing: true });
  const result = await e.call({ mbid: ' missing ' });
  assert.equal(result.status, 404);
  assert.equal(result.error, 'NotFound');
  assert.equal(result.message, 'Song not found: missing');
  assert.equal(e.queries.length, 1);
});
