import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { createTables } from './helpers/postgres.mjs';
import { Credentials } from '../build/dev/javascript/rocksky_api/rocksky_api/node/xrpc_server.mjs';
import { Some, None } from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';
import { register as event } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/event/get_event.mjs';
import { register as events } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/event/get_events.mjs';
import { register as rsvps } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/event/get_event_rsvps.mjs';
import { register as artistEvents } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/artist/get_artist_events.mjs';
import { register as generator } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/feed/get_feed_generator.mjs';
import { register as generators } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/feed/get_feed_generators.mjs';

test('Events resolve duplicates, aggregate RSVP groups, filter dates and artists, and flatten records', {skip:!process.env.GLEAM_TEST_PGHOST}, async()=>{
  const client=new pg.Client({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres'});
  await client.connect();
  try {
    await createTables(client,['users','events','event_artists','event_rsvps','artists','feeds']);
    await client.query(`
      INSERT INTO users (xata_id,did,handle,display_name,avatar) VALUES ('u','did:test:u','u.test','User','avatar'),('v','did:test:v','v.test','Visitor','');
      INSERT INTO artists (xata_id,name,sha256,uri) VALUES ('a','Artist','artist-sha','at://artist');
      INSERT INTO events (xata_id,uri,music_uri,name,created_by,starts_at,ends_at,genre) VALUES
        ('e','at://did:test:u/community.lexicon.calendar.event/e','at://did:test:u/app.rocksky.event.music/e','Main','u','2024-01-02','2024-01-04','Rock'),
        ('dup','at://did:test:u/community.lexicon.calendar.event/dup','at://did:test:u/app.rocksky.event.music/dup','Duplicate','u','2024-01-02',NULL,'Rock'),
        ('undated','at://undated','at://undated/music','Undated','u',NULL,NULL,NULL),
        ('old','at://old','at://old/music','Old','u','2000-01-01',NULL,NULL);
      UPDATE events SET duplicate_of='e' WHERE xata_id='dup';
      INSERT INTO event_artists (event_id,artist_id,name,position) VALUES ('e','a','Artist',1),('e','unknown','Guest',0);
      INSERT INTO event_rsvps (xata_id,event_id,user_id,uri,status,xata_updatedat) VALUES
        ('r1','e','u','at://r1','community.lexicon.calendar.rsvp#going','2024-01-01'),
        ('r2','dup','v','at://r2','community.lexicon.calendar.rsvp#interested','2024-01-02');
      INSERT INTO feeds (xata_id,display_name,did,uri,user_id) VALUES ('f','Feed','did:feed','at://feed','u');
    `);
    await client.query('UPDATE events SET media=$1, locations=$2, uris=$3 WHERE xata_id=$4',[
      JSON.stringify([{role:'banner',content:{ref:{$link:'banner'},size:0}},{role:'thumbnail',content:{ref:{$link:'thumb'},mimeType:'image/png',size:42},aspect_ratio:{width:100,height:50},alt:'Cover'},{role:'invalid'}]),
      JSON.stringify([{$type:'community.lexicon.location.address',name:'Venue',country:'MG',locality:'Tana'},{$type:'community.lexicon.location.fsq',fsq_place_id:'place',latitude:'1'},{$type:'community.lexicon.location.hthree',value:'cell'},{$type:'unknown'}]),
      JSON.stringify([{uri:'https://tickets.test',name:'Tickets'},{name:'missing'}]),'e']);
    const methods=new Map(); const ctx={db:{pool:client},read_db:{pool:client}};
    for(const register of [event,events,rsvps,artistEvents,generator,generators]) register({method:(n,c)=>methods.set(n,c)},ctx);
    const call=async(name,params,did)=>methods.get('app.rocksky.'+name).handler({params,auth:did?{credentials:new Credentials(new Some(did),new None(),new None())}:{}});
    const uri='at://u.test/community.lexicon.calendar.event/dup';
    const view=(await call('event.getEvent',{uri},'did:test:v')).body;
    assert.equal(view.id,'e'); assert.deepEqual(view.rsvpCounts,{going:1,interested:1,notGoing:0});
    assert.equal(view.viewerRsvp,'community.lexicon.calendar.rsvp#interested');
    assert.deepEqual(view.artists.map(a=>a.name),['Guest','Artist']); assert.equal(view.artists[0].id,undefined);
    assert.equal(view.media.length,2); assert.equal(view.media[0].size,undefined); assert.equal(view.media[1].width,100);
    assert.equal(view.imageUrl,'https://cdn.bsky.app/img/feed_fullsize/plain/did:test:u/thumb@jpeg');
    assert.equal(view.locations.length,3); assert.equal(view.locations[1].fsqPlaceId,'place'); assert.equal(view.locations[2].h3,'cell');
    assert.deepEqual(view.uris,[{uri:'https://tickets.test',name:'Tickets'}]);
    assert.deepEqual((await call('event.getEvents',{})).body.events.map(e=>e.id),['undated']);
    assert.deepEqual((await call('event.getEvents',{includePast:true})).body.events.map(e=>e.id),['e','old','undated']);
    assert.deepEqual((await call('event.getEvents',{from:'2024-01-03',to:'2024-01-05',genre:'rock'})).body.events.map(e=>e.id),['e']);
    assert.deepEqual((await call('event.getEvents',{rsvpBy:'did:test:v',includePast:true})).body.events.map(e=>e.id),['e']);
    for(const uri of ['at://artist','a','artist-sha']) assert.deepEqual((await call('artist.getArtistEvents',{uri,includePast:true})).body.events.map(e=>e.id),['e']);
    assert.equal((await call('event.getEvents',{from:'invalid'})).status,400);
    const members=(await call('event.getEventRsvps',{uri})).body.rsvps;
    assert.deepEqual(members.map(r=>r.uri),['at://r2','at://r1']); assert.equal(members[0].avatar,undefined);
    assert.equal((await call('event.getEventRsvps',{uri,status:'community.lexicon.calendar.rsvp#going'})).body.rsvps.length,1);
    const feed=(await call('feed.getFeedGenerator',{feed:'at://feed'})).body.view;
    assert.equal(feed.name,'Feed'); assert.equal(feed.creator.createdAt,undefined);
    assert.deepEqual((await call('feed.getFeedGenerator',{feed:'at://missing'})).body,{});
    assert.deepEqual((await call('feed.getFeedGenerators',{size:1})).body.feeds,[feed]);
  } finally { await client.end(); }
});
