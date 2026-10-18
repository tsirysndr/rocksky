import assert from 'node:assert/strict';
import {test} from 'node:test';
import pg from 'pg';
import axios from 'axios';
import {createTables} from './helpers/postgres.mjs';
import {Ok} from '../build/dev/javascript/rocksky_api/gleam.mjs';
import {Some,None} from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';
import {GetFeedParams,GetStoriesParams,encode_feed_stories_view,encode_feed_view as encode} from '../build/dev/javascript/rocksky_api/rocksky_api/lexicon/models.mjs';
import * as feed from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/feed/get_feed.mjs';
import * as stories from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/feed/get_stories.mjs';
import {describe} from '../build/dev/javascript/rocksky_api/rocksky_api/error.mjs';
test('Feed hydration respects timestamps, per-track likes, caller cache and generator routing',{skip:!process.env.GLEAM_TEST_PGHOST},async()=>{
 const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});const original=axios.defaults.adapter;const calls=[],cache=new Map();
 axios.defaults.adapter=async config=>{calls.push(config);return {status:200,headers:{},config,data:{cursor:'next',feed:[{scrobble:'at://older'},{scrobble:'at://newer'}]}};};
 try{
 await createTables(pool,['users','artists','tracks','scrobbles','loved_tracks','feeds','albums','follows']);
 await pool.query("INSERT INTO users(xata_id,did,handle,display_name,avatar) VALUES ('u','did:u','u.test','U','')");
 await pool.query("INSERT INTO artists(xata_id,name,sha256,uri,genres) VALUES ('a','Artist','a','at://artist',ARRAY['rock'])");
 await pool.query("INSERT INTO tracks(xata_id,title,artist,album,album_artist,sha256,duration,uri,artist_uri,lyrics) VALUES ('t','Title','Artist','Album','Artist','t',1000,'at://song','at://artist','secret lyrics')");
 await pool.query("INSERT INTO scrobbles(xata_id,user_id,track_id,timestamp,uri) VALUES ('s1','u','t','2025-01-01','at://older'),('s2','u','t','2025-02-01','at://newer')");
 await pool.query("INSERT INTO loved_tracks(user_id,track_id) VALUES ('u','t')");
 await pool.query("INSERT INTO feeds(xata_id,did,uri,display_name,user_id) VALUES ('f','did:web:feeds.test','at://feed','Feed','u')");
 const ctx={db:{pool},env:{public_url:'https://rocksky.test',rocksky_feedgen_did:'did:web:feeds.test',rocksky_feedgen_port:8003},redis:{get:async key=>cache.get(key),setEx:async(key,ttl,value)=>{assert.equal(ttl,30);cache.set(key,value);}}};
 const params=new GetFeedParams('at://feed',new Some(10),new None());
 let result=await feed.cached(ctx,params,new Some('did:u'));assert.ok(result instanceof Ok,result instanceof Ok?'':describe(result[0]));let view=encode(result[0]);assert.equal(view.cursor,'next');assert.deepEqual(view.feed.map(r=>r.scrobble.id),['s2','s1']);assert.equal(view.feed[0].scrobble.liked,true);assert.equal(view.feed[0].scrobble.likesCount,1);assert.deepEqual(view.feed[0].scrobble.tags,['rock']);assert.ok(!('lyrics'in view.feed[0].scrobble));assert.equal(calls[0].url,'http://localhost:8003/xrpc/app.rocksky.feed.getFeedSkeleton');
 assert.ok((await feed.cached(ctx,params,new Some('did:u'))) instanceof Ok);assert.equal(calls.length,1);
 result=await feed.cached(ctx,params,new None());assert.ok(result instanceof Ok);assert.equal(encode(result[0]).feed[0].scrobble.liked,false);assert.equal(calls.length,2);
 let story=await stories.retrieve(ctx,new GetStoriesParams(new Some(20),new None(),new None()),new Some('did:u'));assert.ok(story instanceof Ok,story instanceof Ok?'':describe(story[0]));let sv=encode_feed_stories_view(story[0]);assert.equal(sv.stories.length,1);assert.equal(sv.stories[0].uri,'at://newer');assert.equal(sv.stories[0].liked,true);
 const followed=new GetStoriesParams(new Some(20),new None(),new Some(true));story=await stories.retrieve(ctx,followed,new Some('did:u'));assert.ok(story instanceof Ok);assert.equal(encode_feed_stories_view(story[0]).stories.length,0);assert.ok(!((await stories.retrieve(ctx,followed,new None())) instanceof Ok));
 cache.set('feed:ver:at://feed','1');ctx.env.rocksky_feedgen_did='did:web:other';assert.ok((await feed.cached(ctx,params,new None())) instanceof Ok);assert.equal(calls.at(-1).url,'https://feeds.test/xrpc/app.rocksky.feed.getFeedSkeleton');
 }finally{axios.defaults.adapter=original;await pool.end();}
});
