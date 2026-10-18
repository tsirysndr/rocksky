import assert from 'node:assert/strict';
import {test} from 'node:test';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import {createTables} from './helpers/postgres.mjs';
import {app} from '../build/dev/javascript/rocksky_api/rocksky_api/users/app.mjs';
test('Legacy users routes preserve catalog shapes, analytics mapping and caller-scoped shout flags',{skip:!process.env.GLEAM_TEST_PGHOST},async()=>{
 const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
 try{
 await createTables(pool,['users','tracks','albums','artists','user_tracks','user_albums','user_artists','scrobbles','loved_tracks','album_tracks','artist_tracks','artist_albums','playlists','playlist_tracks','shouts','profile_shouts','shout_likes','shout_reports']);
 await pool.query("INSERT INTO users(xata_id,did,handle,display_name,avatar) VALUES ('u','did:plc:u','u.test','U',''),('v','did:plc:v','v.test','V','')");
 const song='at://did:plc:u/app.rocksky.song/t',album='at://did:plc:u/app.rocksky.album/al',artist='at://did:plc:u/app.rocksky.artist/a',scrobble='at://did:plc:u/app.rocksky.scrobble/s',playlist='at://did:plc:u/app.rocksky.playlist/p',shout='at://did:plc:u/app.rocksky.shout/sh';
 await pool.query("INSERT INTO tracks(xata_id,title,artist,album,album_artist,sha256,duration,uri,lyrics) VALUES ('t','Title','Artist','Album','Artist','t',1000,$1,'lyrics')",[song]);await pool.query("INSERT INTO albums(xata_id,title,artist,sha256,uri) VALUES ('al','Album','Artist','al',$1)",[album]);await pool.query("INSERT INTO artists(xata_id,name,sha256,uri) VALUES ('a','Artist','a',$1)",[artist]);
 await pool.query("INSERT INTO user_tracks(user_id,track_id,uri) VALUES ('u','t',$1)",[song]);await pool.query("INSERT INTO user_albums(user_id,album_id,uri) VALUES ('u','al',$1)",[album]);await pool.query("INSERT INTO user_artists(user_id,artist_id,uri) VALUES ('u','a',$1)",[artist]);await pool.query("INSERT INTO album_tracks(album_id,track_id) VALUES ('al','t')");
 await pool.query("INSERT INTO scrobbles(xata_id,user_id,track_id,album_id,artist_id,uri,timestamp) VALUES ('s','u','t','al','a',$1,now())",[scrobble]);await pool.query("INSERT INTO loved_tracks(user_id,track_id) VALUES ('v','t')");await pool.query("INSERT INTO playlists(xata_id,name,created_by,uri) VALUES ('p','Playlist','u',$1)",[playlist]);await pool.query("INSERT INTO playlist_tracks(playlist_id,track_id) VALUES ('p','t')");
 await pool.query("INSERT INTO shouts(xata_id,content,author_id,track_id,artist_id,album_id,scrobble_id,uri) VALUES ('sh','Hello','u','t','a','al','s',$1)",[shout]);await pool.query("INSERT INTO profile_shouts(shout_id,user_id) VALUES ('sh','u')");await pool.query("INSERT INTO shout_likes(shout_id,user_id,uri) VALUES ('sh','v','at://like')");
 const calls=[];const ctx={db:{pool},env:{jwt_secret:'test'},analytics:axios.create({adapter:async config=>{calls.push(config);return {status:200,headers:{},config,data:config.url==='library.getStats'?{scrobbles:1,artists:2,loved_tracks:3,albums:4,tracks:5}:[{title:'Analytics',custom:true}]};}})};const api=app(ctx),token=jwt.sign({did:'did:plc:v'},'test');const call=(path,method='GET',signed=false)=>api.request(path,{method,headers:signed?{authorization:'Bearer '+token}:{}});
 let r=await call('/u.test');assert.equal((await r.json()).id,'u');assert.equal((await call('/missing')).status,404);
 r=await call('/u.test/albums?size=5');assert.deepEqual((await r.json())[0].tags,[]);assert.equal(JSON.parse(calls.at(-1).data).pagination.take,5);assert.equal((await (await call('/u.test/stats')).json()).lovedTracks,3);
 for(const kind of ['song','album','artist','scrobble']){const key={song:'t',album:'al',artist:'a',scrobble:'s'}[kind];r=await call(`/did:plc:u/app.rocksky.${kind}/${key}`);assert.equal(r.status,200,await r.clone().text());const value=await r.json();assert.equal(value.listeners,1);assert.equal(value.scrobbles,1);}
 r=await call('/did:plc:u/app.rocksky.playlist/p','GET',true);let value=await r.json();assert.equal(value.curatedBy.id,'u');assert.equal(value.tracks[0].liked,true);assert.equal(value.tracks[0].lyrics,'lyrics');assert.equal((await (await call('/u.test/playlists')).json())[0].trackCount,1);
 value=await (await call('/did:plc:u/app.rocksky.song/t/shouts','GET',true)).json();assert.equal(value[0].shouts.liked,true);assert.equal(value[0].shouts.gifUrl,null);assert.equal(value[0].users.id,'u');
 value=await (await call('/u.test/shouts','GET',true)).json();assert.equal(value[0].shouts.liked,true);assert.equal(value[0].shouts.reported,false);assert.ok(value[0].profileShouts.id);
 r=await call('/did:plc:u/app.rocksky.shout/sh/report','POST',true);assert.equal(r.status,200);const report=await r.json();assert.equal(report.userId,'v');assert.equal((await (await call('/did:plc:u/app.rocksky.shout/sh/report','POST',true)).json()).id,report.id);
 assert.equal((await (await call('/u.test/shouts','GET',true)).json())[0].shouts.reported,true);assert.equal((await call('/did:plc:u/app.rocksky.shout/sh/report','DELETE',true)).status,200);assert.equal((await call('/did:plc:u/app.rocksky.shout/sh/report','DELETE',true)).status,404);
 }finally{await pool.end();}
});
