import { register as scrobbleChart } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/charts/get_scrobbles_chart.mjs';
import { register as scrobblesFeed } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/scrobble/get_scrobbles.mjs';
import { register as actorSongs } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/actor/get_actor_songs.mjs';
import { register as actorAlbums } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/actor/get_actor_albums.mjs';
import { register as actorArtists } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/actor/get_actor_artists.mjs';
import { register as profileStats } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/stats/get_stats.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { app as restApp } from '../build/dev/javascript/rocksky_api/rocksky_api/api.mjs';
import { new$ as metrics } from '../build/dev/javascript/rocksky_api/rocksky_api/telemetry/metrics.mjs';
import { createTables } from './helpers/postgres.mjs';
import { register as album } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/album/get_album.mjs';
import { register as albumTracks } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/album/get_album_tracks.mjs';
import { register as artistAlbums } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/artist/get_artist_albums.mjs';
import { register as artistTracks } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/artist/get_artist_tracks.mjs';
import { register as listeners } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/artist/get_artist_listeners.mjs';
import { register as stats } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/stats/get_global_stats.mjs';
import { register as scrobble } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/scrobble/get_scrobble.mjs';
import { register as decades } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/charts/get_decades.mjs';
import { register as topTracks } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/charts/get_top_tracks.mjs';
import { register as topArtists } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/charts/get_top_artists.mjs';
import { register as allAlbums } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/album/get_albums.mjs';
import { register as allArtists } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/artist/get_artists.mjs';
import { register as actorLoved } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/actor/get_actor_loved_songs.mjs';
import { register as actorScrobbles } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/actor/get_actor_scrobbles.mjs';
import { register as songs } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/song/get_songs.mjs';
import { register as artist } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/artist/get_artist.mjs';

test('Drizzle catalog returns album tracks, counts, artist and Discogs metadata', {skip:!process.env.GLEAM_TEST_PGHOST}, async()=>{
  const client=new pg.Client({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres'});
  await client.connect();
  try {
    await createTables(client,['albums','artist_albums','artist_tracks','album_tracks','user_albums','tracks','artists','user_artists','scrobbles','loved_tracks','users','follows',
      'discogs_releases','discogs_masters','discogs_credits','discogs_tracks','discogs_release_labels','discogs_identifiers','discogs_release_artists']);
    await client.query(`
      INSERT INTO artists (xata_id,name,sha256,uri,genres) VALUES ('ar','Artist','ar','at://artist',ARRAY['rock']);
      INSERT INTO user_artists (user_id,artist_id,uri) VALUES ('u','ar','at://user/artist');
      INSERT INTO albums (xata_id,title,artist,sha256,uri,artist_uri,discogs_release_id) VALUES ('al','Album','Artist','al','at://album','at://artist','dr');
      INSERT INTO artist_albums (artist_id,album_id) VALUES ('ar','al');
      INSERT INTO artist_tracks (artist_id,track_id) VALUES ('ar','t1'),('ar','t2'),('ar','t3');
      INSERT INTO user_albums (user_id,album_id,uri) VALUES ('u','al','at://user/album');
      INSERT INTO tracks (xata_id,title,artist,album_artist,album,duration,sha256,disc_number,track_number,lyrics)
        VALUES ('t1','First','Artist','Artist','Album',120000,'t1',1,1,NULL),
          ('t2','First with lyrics','Artist','Artist','Album',120000,'t2',1,1,'lyrics'),
          ('t3','Second','Artist','Artist','Album',150000,'t3',1,2,NULL);
      INSERT INTO album_tracks (album_id,track_id) VALUES ('al','t1'),('al','t2'),('al','t3');
      INSERT INTO scrobbles (album_id,artist_id,timestamp) VALUES ('al','ar',now()),('al','ar',now());
      INSERT INTO discogs_releases (xata_id,discogs_id,master_id,title,artist,score) VALUES ('dr',123,456,'Release','Artist',0.75);
      INSERT INTO discogs_masters (discogs_id,title,year) VALUES (456,'Original',1999);
    `);
    const methods=new Map();
    const cache=new Map();
    const ctx={db:{pool:client},read_db:{pool:client},redis:{get:async k=>cache.get(k)??null,setEx:async(k,ttl,v)=>{cache.set(k,v);}}};
    for(const register of [album,albumTracks,artist,songs,artistAlbums,artistTracks,listeners,stats,scrobble,decades,topTracks,topArtists,allAlbums,allArtists,actorLoved,actorScrobbles,actorSongs,actorAlbums,actorArtists,profileStats,scrobblesFeed,scrobbleChart]) register({method:(nsid,c)=>methods.set(nsid,c)},ctx);
    const call=async(name,uri)=>methods.get('app.rocksky.'+name).handler({params:{uri},auth:{}});
    const a=(await call('album.getAlbum','at://album')).body;
    assert.equal(a.title,'Album');
    assert.equal(a.playCount,2); assert.equal(a.uniqueListeners,1);
    assert.deepEqual(a.tags,['rock']);
    assert.deepEqual(a.tracks.map(t=>t.id),['t2','t3']);
    assert.equal(a.discogs.releaseId,123); assert.equal(a.discogs.score,75); assert.equal(a.discogs.master.year,1999);
    const tracks=(await call('album.getAlbumTracks','at://user/album')).body.tracks;
    assert.deepEqual(tracks.map(t=>t.id),['t2','t3']);
    for(const uri of ['at://artist','at://user/artist']) {
      const ar=(await call('artist.getArtist',uri)).body;
      assert.equal(ar.name,'Artist'); assert.equal(ar.playCount,2); assert.equal(ar.uniqueListeners,1);
    }
    assert.equal((await call('album.getAlbum','at://missing')).status,404);
    assert.equal((await call('artist.getArtistAlbums','at://artist')).body.albums[0].playCount,2);
    const artistSongPage=(await methods.get('app.rocksky.artist.getArtistTracks').handler({params:{uri:'at://artist',limit:2,offset:0},auth:{}})).body.tracks;
    assert.deepEqual(artistSongPage.map(t=>t.id),['t1','t2']);
    const querySongs=async params=>methods.get('app.rocksky.song.getSongs').handler({params,auth:{}});
    const filtered=(await querySongs({filter:'duration=ge=150000'})).body.tracks;
    assert.deepEqual(filtered.map(t=>t.id),['t3']);
    assert.equal(filtered[0].playCount,0);
    const wildcard=(await querySongs({filter:'title==First*',limit:1,offset:1})).body.tracks;
    assert.deepEqual(wildcard.map(t=>t.id),['t2']);
    await client.query("UPDATE tracks SET album='Album (rEmAsTeReD 100%_)' WHERE xata_id='t2'");
    const remasters=(await querySongs({filter:'album=="*Remaster*"',limit:50,offset:0})).body.tracks;
    assert.deepEqual(remasters.map(t=>t.id),['t2']);
    const escaped=(await querySongs({filter:'album=="*100%_*"'})).body.tracks;
    assert.deepEqual(escaped.map(t=>t.id),['t2']);
    const excluded=(await querySongs({filter:'album!="*Remaster*"'})).body.tracks;
    assert.deepEqual(excluded.map(t=>t.id),['t1','t3']);
    await client.query("UPDATE tracks SET album='Album' WHERE xata_id='t2'");
    const bad=await querySongs({filter:'password==secret'});
    assert.equal(bad.status,400); assert.equal(bad.error,'InvalidFilter');
    await client.query("UPDATE tracks SET mb_id = 'mbid' WHERE xata_id = 't3'");
    const direct=(await querySongs({mbid:'mbid',filter:'duration=gt=100'})).body.tracks;
    assert.deepEqual(direct.map(t=>t.id),['t3']);
    assert.equal(direct[0].mbid,'mbid');
    await client.query(`INSERT INTO users (xata_id,did,handle,display_name,avatar) VALUES ('u','did:test:u','u.test','User','avatar');
      INSERT INTO scrobbles (xata_id,user_id,track_id,artist_id,album_id,uri,timestamp) VALUES
        ('sc1','u','t3','ar','al','at://sc1','2024-01-01'),('sc2','u','t3','ar','al','at://sc2','2024-01-02');`);
    const statsBody=(await methods.get('app.rocksky.stats.getGlobalStats').handler({params:{},auth:{}})).body;
    assert.deepEqual(statsBody,{scrobbles:4,users:1,artists:1,albums:1,tracks:3});
    const fans=(await call('artist.getArtistListeners','at://artist')).body.listeners;
    assert.equal(fans.length,1); assert.equal(fans[0].id,'u'); assert.equal(fans[0].totalPlays,2);
    assert.equal(fans[0].mostListenedSong.title,'Second'); assert.equal(fans[0].mostListenedSong.playCount,2);
    const detail=(await call('scrobble.getScrobble','at://sc1')).body;
    assert.equal(detail.title,'Second'); assert.equal(detail.listeners,1); assert.equal(detail.scrobbles,2);
    await client.query("UPDATE albums SET year=1999 WHERE xata_id='al'");
    const decadeResponse=await methods.get('app.rocksky.charts.getDecades').handler({params:{did:'u.test'},auth:{}});
    assert.deepEqual(decadeResponse.body.decades,[{decade:1990,scrobbles:2,uniqueAlbums:1}]);
    await client.query(`CREATE TEMP VIEW chart_tracks_mv AS SELECT track_id,count(*) AS scrobbles,count(DISTINCT user_id) AS unique_listeners FROM scrobbles GROUP BY track_id;
      CREATE TEMP VIEW chart_artists_mv AS SELECT artist_id,count(*) AS scrobbles,count(DISTINCT user_id) AS unique_listeners FROM scrobbles GROUP BY artist_id;`);
    for(const params of [{},{did:'u.test'},{startDate:'2023-01-01',endDate:'2025-01-01'}]) {
      const chart=(await methods.get('app.rocksky.charts.getTopTracks').handler({params,auth:{}})).body.tracks;
      assert.equal(chart[0].id,'t3'); assert.equal(chart[0].playCount,2);
      const artistsChart=(await methods.get('app.rocksky.charts.getTopArtists').handler({params,auth:{}})).body.artists;
      assert.equal(artistsChart[0].id,'ar'); assert.equal(artistsChart[0].uniqueListeners,1);
    }
    const invoke=async(name,params)=>(await methods.get('app.rocksky.'+name).handler({params,auth:{}}));
    for(const params of [{},{filter:'year==1999'}]) {
      const result=(await invoke('album.getAlbums',params)).body.albums;
      assert.equal(result[0].id,'al'); assert.equal(result[0].playCount,4); assert.equal(result[0].uniqueListeners,1);
    }
    for(const params of [{},{filter:'genres==rock'},{names:' Artist , '},{genre:'rock'}]) {
      const result=(await invoke('artist.getArtists',params)).body.artists;
      assert.equal(result[0].id,'ar'); assert.deepEqual(result[0].genres,['rock']); assert.equal(result[0].playCount,4);
    }
    assert.equal((await invoke('artist.getArtists',{filter:'unknown==1'})).status,400);
    assert.equal((await invoke('album.getAlbums',{filter:'year=gt=no'})).status,400);
    await client.query("INSERT INTO loved_tracks (user_id,track_id,uri,xata_createdat) VALUES ('u','t3','at://like','2024-02-01')");
    const loved=(await invoke('actor.getActorLovedSongs',{did:'u.test'})).body.tracks;
    assert.equal(loved[0].id,'t3'); assert.equal(loved[0].createdAt,'2024-02-01T00:00:00.000Z');
    const history=(await invoke('actor.getActorScrobbles',{did:'did:test:u',limit:1,offset:1})).body.scrobbles;
    assert.equal(history[0].id,'sc1'); assert.equal(history[0].trackId,'t3'); assert.equal(history[0].liked,false);
    const rest=restApp({...ctx,redis:{eval:async()=>1},metrics:metrics()});
    for(const [path,field,value] of [['/tracks/t3','title','Second'],['/albums/al','title','Album'],['/artists/ar','name','Artist']]) {
      const response=await rest.request(path);
      assert.equal(response.status,200);
      assert.equal((await response.json())[field],value);
    }
    assert.equal((await (await rest.request('/public/scrobbles')).json()).length,2);
    assert.equal((await (await rest.request('/albums/al/tracks')).json()).length,3);
    assert.equal((await (await rest.request('/artists/ar/tracks')).json()).length,3);



    const originalQuery=client.query.bind(client); let profileQueries=0;
    client.query=(...args)=>{profileQueries++; return originalQuery(...args);};
    for(const [name,key,id] of [['getActorSongs','tracks','t3'],['getActorAlbums','albums','al'],['getActorArtists','artists','ar']]) {
      profileQueries=0;
      const page=(await invoke('actor.'+name,{did:'u.test',startDate:'2024-01-01',endDate:'2024-01-03'})).body[key];
      assert.equal(profileQueries,1);
      assert.equal(page[0].id,id); assert.equal(page[0].playCount,2); assert.equal(page[0].uniqueListeners,1);
      assert.deepEqual((await invoke('actor.'+name,{did:'unknown'})).body[key],[]);
      assert.deepEqual((await invoke('actor.'+name,{did:'u.test',offset:1})).body[key],[]);
    }
    profileQueries=0;
    const simultaneous=await Promise.all(Array.from({length:8},()=>invoke('stats.getStats',{did:'u.test'})));
    assert.equal(profileQueries,2);
    const personalStats=simultaneous[0].body;
    assert.ok(simultaneous.every(r=>JSON.stringify(r.body)===JSON.stringify(personalStats)));
    client.query=originalQuery;
    assert.deepEqual(personalStats,{scrobbles:2,artists:1,lovedTracks:1,albums:1,tracks:1});
    assert.ok(cache.has('stats:v1:u.test'));
    assert.deepEqual((await invoke('stats.getStats',{did:'missing'})).body,{scrobbles:0,artists:0,lovedTracks:0,albums:0,tracks:0});
    assert.equal(cache.has('stats:v1:missing'),false);
    cache.delete('stats:v1:u.test');
    await client.query("INSERT INTO loved_tracks(user_id,track_id) VALUES ('u','t2')");
    assert.equal((await invoke('stats.getStats',{did:'u.test'})).body.lovedTracks,2);
    await client.query("DELETE FROM loved_tracks WHERE user_id='u' AND track_id='t2'");
    cache.delete('stats:v1:u.test');
    await client.query("CREATE TEMP TABLE scrobbles_per_day_mv (day date,count bigint); INSERT INTO scrobbles_per_day_mv VALUES ('2024-01-01',1)");
    for(const scope of [{},{did:'u.test'},{artisturi:'at://artist'},{albumuri:'at://album'}]) {
      const chart=(await invoke('charts.getScrobblesChart',{...scope,from:'2024-01-01',to:'2024-01-02'})).body.scrobbles;
      assert.deepEqual(chart,[{date:'2024-01-01',count:1},{date:'2024-01-02',count:1}]);
    }
    assert.deepEqual((await invoke('charts.getScrobblesChart',{did:'unknown'})).body.scrobbles,[]);
    // An empty materialized view must fall back to the entire live window.
    await client.query('TRUNCATE scrobbles_per_day_mv');
    assert.deepEqual((await invoke('charts.getScrobblesChart',{from:'2024-01-02',to:'2024-01-02'})).body.scrobbles,[{date:'2024-01-02',count:1}]);
    const feedParams={filter:'user.did==did:test:u',did:'did:test:u'};
    const feed=(await invoke('scrobble.getScrobbles',feedParams)).body.scrobbles;
    assert.deepEqual(feed.map(s=>s.id),['sc2','sc1']); assert.equal(feed[0].liked,true); assert.equal(feed[0].likesCount,1);
    assert.equal(feed[0].user,'u.test'); assert.deepEqual(feed[0].tags,['rock']); assert.equal(feed[0].lyrics,undefined);
    assert.equal((await invoke('scrobble.getScrobbles',{filter:'unknown==bad'})).status,400);
    assert.deepEqual((await invoke('scrobble.getScrobbles',{did:'did:viewer',following:true})).body.scrobbles,[]);
    await client.query("INSERT INTO follows (follower_did,subject_did,uri) VALUES ('did:viewer','did:test:u','at://follow')");
    cache.set('scrobbles:ver','1');
    const followed=(await invoke('scrobble.getScrobbles',{did:'did:viewer',following:true})).body.scrobbles;
    assert.deepEqual(followed.map(s=>s.id),['sc2','sc1']); assert.equal(followed[0].liked,false);
    await client.query("DELETE FROM scrobbles WHERE xata_id='sc2'");
    assert.equal((await invoke('scrobble.getScrobbles',{did:'did:viewer',following:true})).body.scrobbles.length,2);
    cache.set('scrobbles:ver','2');
    assert.equal((await invoke('scrobble.getScrobbles',{did:'did:viewer',following:true})).body.scrobbles.length,1);
    await client.query(`INSERT INTO users (xata_id,did,handle,display_name,avatar) VALUES ('v','did:test:v','v.test','V','');
      INSERT INTO scrobbles (user_id,track_id,artist_id,album_id,timestamp) VALUES ('v','t3','ar','al','2024-01-01');`);
    for(const [name,key] of [['getActorSongs','tracks'],['getActorAlbums','albums'],['getActorArtists','artists']]) {
      const page=(await invoke('actor.'+name,{did:'did:test:u',startDate:'2024-01-01',endDate:'2024-01-02'})).body[key];
      assert.equal(page[0].playCount,1); assert.equal(page[0].uniqueListeners,2);
    }
  } finally { await client.end(); }
});
