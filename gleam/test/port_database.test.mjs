import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { register as song } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/song/get_song.mjs';
import { register as songListeners } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/song/get_song_recent_listeners.mjs';
import { register as artistListeners } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/artist/get_artist_recent_listeners.mjs';
import { register as listNotifications } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/notification/list_notifications.mjs';
import { register as updateSeen } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/notification/update_seen.mjs';
import { register as putMirror } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/mirror/put_mirror_source.mjs';
import { register as getMirrors } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/mirror/get_mirror_sources.mjs';
import { page as graphPage } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/graph/queries.mjs';
import { toList, Ok } from '../build/dev/javascript/rocksky_api/gleam.mjs';
import { Credentials } from '../build/dev/javascript/rocksky_api/rocksky_api/node/xrpc_server.mjs';
import { Some, None } from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';

const enabled = !!process.env.GLEAM_TEST_PGHOST;
test('PostgreSQL parity: song lookup, recent listeners, notifications and mirror settings', { skip: !enabled }, async () => {
  const client = new pg.Client({ host: process.env.GLEAM_TEST_PGHOST, port: Number(process.env.GLEAM_TEST_PGPORT ?? 5432), database: 'postgres' });
  await client.connect();
  try {
    await client.query(`
      CREATE FUNCTION pg_temp.xata_id() RETURNS text LANGUAGE SQL AS 'SELECT md5(random()::text)';
      SET search_path = pg_temp, public;
      CREATE TEMP TABLE users (xata_id text, did text, handle text, display_name text, avatar text);
      CREATE TEMP TABLE tracks (xata_id text, uri text, title text, artist text, album_artist text, album text, duration int, sha256 text,
        mb_id text, isrc text, spotify_link text, artist_uri text, album_art text, xata_createdat timestamp DEFAULT '2024-01-01', xata_updatedat timestamp DEFAULT '2024-01-01');
      CREATE TEMP TABLE artists (xata_id text, uri text, name text, sha256 text, genres text[], xata_createdat timestamp DEFAULT '2024-01-01', xata_updatedat timestamp DEFAULT '2024-01-01');
      CREATE TEMP TABLE user_tracks (track_id text, user_id text, uri text);
      CREATE TEMP TABLE scrobbles (track_id text, artist_id text, user_id text, uri text, timestamp timestamp);
      CREATE TEMP TABLE loved_tracks (track_id text, user_id text);
      CREATE TEMP TABLE shouts (xata_id text, content text);
      CREATE TEMP TABLE albums (uri text, title text, artist text, album_art text);
      CREATE TEMP TABLE notifications (xata_id text DEFAULT md5(random()::text), user_id text, actor_id text, type text, read boolean DEFAULT false,
        read_at timestamptz, subject_uri text, shout_id text, xata_createdat timestamp DEFAULT now());
      CREATE TEMP TABLE mirror_sources (xata_id text DEFAULT md5(random()::text), user_id text, provider text, enabled boolean DEFAULT false,
        push_enabled boolean, external_username text, encrypted_api_key text, last_polled_at timestamp, last_scrobble_seen_at timestamp,
        xata_createdat timestamp DEFAULT now(), xata_updatedat timestamp DEFAULT now());
      INSERT INTO users VALUES ('one','did:test:one','one.test',NULL,'one.png'),('two','did:test:two','two.test','Two','two.png');
      INSERT INTO artists (xata_id,uri,name,sha256,genres) VALUES ('artist','at://artist','Artist','artistsha',ARRAY['rock']),('guest','at://guest','Guest','guestsha',NULL);
      INSERT INTO tracks (xata_id,uri,title,artist,album_artist,album,duration,sha256,mb_id,isrc,spotify_link,artist_uri)
        VALUES ('track','at://did/app.rocksky.song/track','Song','Artist, Guest','Artist','Album',123000,'sha','mbid','isrc','https://open.spotify.com/track/spotify','at://artist');
      INSERT INTO user_tracks VALUES ('track','one','at://one/track'),('track','two','at://two/track');
      INSERT INTO scrobbles VALUES ('track','artist','one','at://first','2024-01-01'),('track','artist','two','at://second','2024-01-02'),('track','artist','one','at://third','2024-01-03');
      INSERT INTO loved_tracks VALUES ('track','one');
      INSERT INTO notifications (xata_id,user_id,actor_id,type,subject_uri,xata_createdat)
        VALUES ('n1','one','two','follow',NULL,'2024-01-02'), ('n2','one','two','like_scrobble','at://did/app.rocksky.song/track','2024-01-03'), ('n3','two','one','follow',NULL,'2024-01-04');
    `);
    await client.query(`ALTER TABLE artists ADD COLUMN biography text, ADD COLUMN born timestamp, ADD COLUMN born_in text, ADD COLUMN died timestamp,
      ADD COLUMN apple_music_link text, ADD COLUMN spotify_link text, ADD COLUMN tidal_link text, ADD COLUMN youtube_link text, ADD COLUMN picture text, ADD COLUMN xata_version int;
      ALTER TABLE mirror_sources ADD COLUMN xata_version int;`);
    await client.query(`ALTER TABLE tracks ADD COLUMN track_number int, ADD COLUMN youtube_link text, ADD COLUMN apple_music_link text,
      ADD COLUMN tidal_link text, ADD COLUMN disc_number int, ADD COLUMN lyrics text, ADD COLUMN composer text, ADD COLUMN genre text,
      ADD COLUMN label text, ADD COLUMN copyright_message text, ADD COLUMN key text, ADD COLUMN bpm real, ADD COLUMN acoustid_fingerprint text,
      ADD COLUMN album_uri text, ADD COLUMN xata_version int;`);
    await client.query(`ALTER TABLE users ADD COLUMN xata_createdat timestamp DEFAULT '2024-01-01', ADD COLUMN xata_updatedat timestamp DEFAULT '2024-01-01';
      CREATE TEMP TABLE follows (xata_id text, uri text, follower_did text, subject_did text, xata_createdat timestamp);
      INSERT INTO follows VALUES ('f1','at://f1','did:test:one','did:test:two','2024-01-01'),
        ('f2','at://f2','did:test:two','did:test:one','2024-01-02'),
        ('f3','at://f3','did:missing','did:test:one','2024-01-03');`);
    const events = [];
    const ctx = { db: { pool: client }, read_db: { pool: client }, nc: { publish: (topic, data) => events.push({ topic, data: Buffer.from(data).toString() }) }, env: { disabled_tealfm: 'did:test:one', storage_encryption_key: 'ab'.repeat(32) } };
    const followed = await graphPage(ctx,'did:test:one',1,new None(),toList([]),true,new None());
    assert.ok(followed instanceof Ok, JSON.stringify(followed));
    assert.equal(followed[0][1].toArray()[0].did[0],'did:test:two');
    assert.equal(followed[0][3],1);
    const nextFollowed = await graphPage(ctx,'did:test:one',1,followed[0][2],toList([]),true,new None());
    assert.ok(nextFollowed instanceof Ok, JSON.stringify(nextFollowed));
    assert.equal(nextFollowed[0][1].toArray().length,0);
    const known = await graphPage(ctx,'did:test:one',10,new None(),toList([]),false,new Some('did:test:one'));
    assert.ok(known instanceof Ok, JSON.stringify(known));
    assert.deepEqual(known[0][1].toArray().map(u=>u.did[0]),['did:test:two']);
    const methods = new Map();
    const server = { method: (nsid, config) => methods.set(nsid, config) };
    for (const register of [song, songListeners, artistListeners, listNotifications, updateSeen, putMirror, getMirrors]) register(server, ctx);
    const call = (name, params = {}, input, did = 'did:test:one') => methods.get(`app.rocksky.${name}`).handler({ params, input: input === undefined ? undefined : { body: input }, auth: did ? { credentials: new Credentials(new Some(did), new None(), new None()) } : {} });
    for (const params of [{uri:'at://one/track'}, {mbid:'mbid'}, {isrc:'isrc'}, {spotifyId:'spotify'}]) {
      const {body} = await call('song.getSong', params);
      assert.equal(body.title, 'Song'); assert.equal(body.playCount, 3); assert.equal(body.uniqueListeners, 2); assert.equal(body.liked, true);
      assert.deepEqual(body.artists.map(a => a.name), ['Artist','Guest']);
    }
    for (const [name, uri] of [['song.getSongRecentListeners','at://did/app.rocksky.song/track'], ['artist.getArtistRecentListeners','at://artist']]) {
      const {body} = await call(name, {uri, limit:1, offset:1});
      assert.equal(body.listeners.length, 1); assert.equal(body.listeners[0].handle,'two.test'); assert.equal(body.listeners[0].scrobbleUri,'at://second');
    }
    const page = (await call('notification.listNotifications', {limit:1})).body;
    assert.equal(page.unreadCount,2); assert.equal(page.notifications[0].id,'n2'); assert.equal(page.notifications[0].subject.title,'Song');
    const next = (await call('notification.listNotifications', {limit:1,cursor:page.cursor})).body;
    assert.equal(next.notifications[0].id,'n1'); assert.equal(next.cursor,undefined);
    assert.equal((await call('notification.updateSeen', {}, {ids:['n2','n3']})).body.unreadCount,1);
    assert.equal((await client.query("SELECT read FROM notifications WHERE xata_id = 'n3'")).rows[0].read,false);
    assert.equal((await call('notification.updateSeen', {}, {})).body.unreadCount,0);
    const initial = (await call('mirror.getMirrorSources')).body.sources;
    assert.equal(initial.length,3); assert.ok(initial.every(s => !s.enabled && !s.pushEnabled));
    const first = (await call('mirror.putMirrorSource', {}, {provider:'lastfm',enabled:true,externalUsername:'listener',apiKey:'secret',pushEnabled:true})).body;
    assert.equal(first.enabled,true); assert.equal(first.hasCredentials,true); assert.equal(first.pushEnabled,true);
    const stored = (await client.query('SELECT * FROM mirror_sources')).rows[0];
    assert.notEqual(stored.encrypted_api_key,'secret');
    assert.ok(Math.abs(Date.now() - stored.last_scrobble_seen_at.getTime() - 86400000) < 5000);
    const cleared = (await call('mirror.putMirrorSource', {}, {provider:'lastfm',apiKey:''})).body;
    assert.equal(cleared.enabled,true); assert.equal(cleared.hasCredentials,false);
    assert.ok(events.some(e => e.topic === 'rocksky.mirror.user'));
    assert.ok(events.some(e => e.topic === 'rocksky.notification.one'));
  } finally { await client.end(); }
});
