import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { createCipheriv, createHash } from 'node:crypto';
import { createTables } from './helpers/postgres.mjs';
import { Credentials } from '../build/dev/javascript/rocksky_api/rocksky_api/node/xrpc_server.mjs';
import { Some, None } from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';
import { register as play } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/spotify/play.mjs';
import { register as pause } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/spotify/pause.mjs';
import { register as next } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/spotify/next.mjs';
import { register as previous } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/spotify/previous.mjs';
import { register as seek } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/spotify/seek.mjs';
import { register as current } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/spotify/get_currently_playing.mjs';

test('Spotify commands refresh encrypted credentials; public playing views preserve metadata and actor likes', {skip:!process.env.GLEAM_TEST_PGHOST}, async()=>{
  const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
  const original=globalThis.fetch;
  try {
    await createTables(pool,['users','spotify_accounts','spotify_apps','spotify_tokens','tracks','loved_tracks']);
    const key='11'.repeat(32),iv='22'.repeat(16);
    const encrypt=text=>{const cipher=createCipheriv('aes-256-ctr',Buffer.from(key,'hex'),Buffer.from(iv,'hex'));return Buffer.concat([cipher.update(text),cipher.final()]).toString('hex');};
    await pool.query(`INSERT INTO users (xata_id,did,handle,display_name,avatar) VALUES ('u','did:test:u','u.test','User','');
      INSERT INTO spotify_accounts (user_id,email,is_beta_user) VALUES ('u','user@example.test',false);`);
    await pool.query('INSERT INTO spotify_apps (spotify_app_id,spotify_secret) VALUES ($1,$2)',['app',encrypt('secret&chars')]);
    await pool.query('INSERT INTO spotify_tokens (user_id,spotify_app_id,access_token,refresh_token) VALUES ($1,$2,$3,$4)',['u','app','unused',encrypt('refresh+token')]);
    await pool.query('INSERT INTO tracks (xata_id,title,artist,album_artist,album,duration,sha256,uri) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      ['t','Song','A, B','A','Album',100,createHash('sha256').update('song - a, b - album').digest('hex'),'at://song']);
    await pool.query("INSERT INTO loved_tracks (user_id,track_id) VALUES ('u','t')");
    let cached={item:{name:'Song',artists:[{name:'A'},{name:'B'}],album:{name:'Album'}},is_playing:true,progress_ms:42,extra:{keep:true},context:null};
    const methods=new Map();const ctx={db:{pool},read_db:{pool},env:{spotify_encryption_key:key,spotify_encryption_iv:iv,spotify_api_url:'https://spotify.test'},redis:{get:async k=>{assert.equal(k,'user@example.test:current');return cached?JSON.stringify(cached):null;}}};
    for(const register of [play,pause,next,previous,seek,current])register({method:(n,c)=>methods.set(n,c)},ctx);
    const calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,options});return url.includes('/api/token')?new Response(JSON.stringify({access_token:'access'})):new Response(null,{status:204});};
    const auth={credentials:new Credentials(new Some('did:test:u'),new None(),new None())};
    const call=(name,params={},authentication=auth)=>methods.get('app.rocksky.spotify.'+name).handler({params,auth:authentication});
    for(const [action,method] of [['play','PUT'],['pause','PUT'],['next','POST'],['previous','POST'],['seek','PUT']]){
      assert.equal(await call(action,{position:12345}),undefined);
      const token=calls.at(-2);const form=new URLSearchParams(token.options.body);
      assert.equal(form.get('refresh_token'),'refresh+token');assert.equal(form.get('client_secret'),'secret&chars');
      assert.equal(calls.at(-1).options.method,method);assert.equal(calls.at(-1).options.headers.Authorization,'Bearer access');
    }
    assert.equal(calls.at(-1).url,'https://spotify.test/me/player/seek?position_ms=12345');
    const playing=(await call('getCurrentlyPlaying',{actor:'u.test'},{})).body;
    assert.equal(playing.songUri,'at://song');assert.equal(playing.liked,true);assert.deepEqual(playing.extra,{keep:true});assert.equal(playing.context,null);
    cached=null;assert.deepEqual((await call('getCurrentlyPlaying',{actor:'u.test'},{})).body,{});
    assert.equal((await call('seek',{})).status,400);
    const before=calls.length;await call('play',{},{});assert.equal(calls.length,before);
  } finally { globalThis.fetch=original;await pool.end(); }
});
