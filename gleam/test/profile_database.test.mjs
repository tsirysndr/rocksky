import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import axios from 'axios';
import { createTables } from './helpers/postgres.mjs';
import { register, retrieve } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/actor/get_profile.mjs';
import { fetch as profile, fetch_with_fallback } from '../build/dev/javascript/rocksky_api/rocksky_api/lib/bsky_profile.mjs';
import { Some, None } from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';
import { encode_detailed } from '../build/dev/javascript/rocksky_api/rocksky_api/views/profile.mjs';
import { Ok } from '../build/dev/javascript/rocksky_api/gleam.mjs';

test('Profile refresh preserves partial fields, creates accounts, publishes changes, and hides Spotify email', {skip:!process.env.GLEAM_TEST_PGHOST}, async()=>{
  const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
  const savedFetch=globalThis.fetch; const savedAdapter=axios.defaults.adapter;
  try {
    await createTables(pool,['users','spotify_accounts','spotify_tokens']);
    await pool.query(`INSERT INTO users (xata_id,did,handle,display_name,avatar) VALUES ('u','did:plc:one','old.test','Original','good-avatar');
      INSERT INTO spotify_accounts (email,user_id,is_beta_user) VALUES ('private@example.test','u',true);`);
    await pool.query('ALTER TABLE users ADD UNIQUE (did)');
    const queries=[];const query=pool.query.bind(pool);pool.query=(...args)=>{queries.push(typeof args[0]==='string'?args[0]:args[0].text);return query(...args);};
    let fetched={}; let handle='one.test'; const messages=[];
    axios.defaults.adapter=async()=>{throw new Error('Profile must not fetch a fresh DID document through Axios');};
    globalThis.fetch=async()=>new Response(JSON.stringify({did:'did:plc:one',handle,...fetched}),{headers:{'content-type':'application/json'}});
    const ctx={db:{pool},read_db:{pool},env:{plc_directory_url:'https://plc.test',bsky_appview_url:'https://appview.test'},
      resolver:{handle:{resolve:async h=>h==='missing.test'?undefined:'did:plc:one'},did:{resolveAtprotoData:async()=>({did:'did:plc:one',handle,pds:'https://pds.test',signingKey:'key'})}},
      nc:{publish:(subject,bytes)=>messages.push({subject,data:JSON.parse(new TextDecoder().decode(bytes))})}};
    let method; register({method:(name,config)=>method=config},ctx);
    const call=async did=>{const r=await retrieve(ctx,new Some(did),new None());return {body:r instanceof Ok?encode_detailed(r[0]):{}};};
    const first=(await call('one.test')).body;
    assert.equal(first.displayName,'Original'); assert.equal(first.avatar,'good-avatar'); assert.equal(first.handle,'one.test');
    assert.equal(queries.filter(q=>q.startsWith('select ')).length,1);
    assert.equal(first.spotifyConnected,false);
    assert.equal(first.spotifyUser.email,undefined); assert.equal(first.spotifyUser.isBetaUser,true);
    assert.equal('googledrive' in first,false); assert.equal('dropbox' in first,false);
    assert.equal(messages.length,1); assert.equal(messages[0].data.display_name,'Original');
    await call('one.test'); assert.equal(messages.length,1);
    await pool.query("INSERT INTO spotify_tokens(access_token,refresh_token,user_id,spotify_app_id) VALUES ('secret-access','secret-refresh','u','app')");
    const connected=(await call('one.test')).body;assert.equal(connected.spotifyConnected,true);assert.ok(!JSON.stringify(connected).includes('secret-'));
    await pool.query('DELETE FROM spotify_tokens');
    fetched={displayName:'Updated',avatar:'https://avatar.test/new'};
    assert.equal((await call('did:plc:one')).body.displayName,'Updated'); assert.equal(messages.length,2);
    assert.equal((await pool.query('SELECT avatar FROM users')).rows[0].avatar,'https://avatar.test/new');
    assert.deepEqual((await call('missing.test')).body,{});
    // An existing user with no Spotify account must still decode successfully.
    await pool.query('DELETE FROM spotify_accounts');queries.length=0;
    const withoutSpotify=(await call('did:plc:one')).body;
    assert.equal(withoutSpotify.did,'did:plc:one');assert.equal(withoutSpotify.displayName,'Updated');
    assert.deepEqual(withoutSpotify.spotifyUser,{});assert.equal(withoutSpotify.spotifyConnected,false);
    assert.equal(queries.filter(q=>q.startsWith('select ')).length,1);
    await pool.query("INSERT INTO spotify_tokens(access_token,refresh_token,user_id,spotify_app_id) VALUES ('secret-access','secret-refresh','u','app')");
    const tokenOnly=(await call('did:plc:one')).body;
    assert.equal(tokenOnly.did,'did:plc:one');assert.deepEqual(tokenOnly.spotifyUser,{});assert.equal(tokenOnly.spotifyConnected,true);
    assert.ok(!JSON.stringify(tokenOnly).includes('secret-'));
    await pool.query('DELETE FROM spotify_tokens');
    // A stalled external profile service cannot delay a saved profile.
    let release;const slow=new Promise(resolve=>{release=resolve;});let resolutions=0;
    const resolve=ctx.resolver.did.resolveAtprotoData;
    ctx.resolver.did.resolveAtprotoData=async()=>{resolutions++;await slow;return resolve();};
    const fast=await Promise.race([method.handler({params:{did:'one.test'},auth:{}}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Saved profile waited on upstream')),1000))]);
    assert.equal(fast.body.did,'did:plc:one');assert.equal(fast.body.displayName,'Updated');
    await method.handler({params:{did:'did:plc:one'},auth:{}});assert.equal(resolutions,1);
    release();ctx.resolver.did.resolveAtprotoData=resolve;
    await new Promise(resolve=>setTimeout(resolve,50));
    await pool.query('DELETE FROM users'); fetched={};
    const created=(await call('did:plc:one')).body;
    assert.equal(created.displayName,''); assert.equal(created.avatar,undefined); assert.deepEqual(created.spotifyUser,{});
    assert.equal(messages.at(-1).data.xata_version,1);
    let fallbacks=0;
    const lazy=await fetch_with_fallback('https://appview.test','did:plc:one',()=>{fallbacks++;throw new Error('unused fallback');});
    assert.ok(lazy instanceof Ok);assert.equal(fallbacks,0);
    globalThis.fetch=async()=>{throw new Error('appview unavailable');};
    const fallback=await profile('https://appview.test','did:plc:one',new Some({com:{atproto:{repo:{getRecord:async()=>({data:{uri:'at://profile',cid:'record-cid',value:{avatar:{ref:{toString:()=> 'blob-cid'},mimeType:'image/png'},displayName:'Fallback'}}})}}}}));
    assert.ok(fallback instanceof Ok); assert.equal(fallback[0].avatar[0],'https://cdn.bsky.app/img/avatar/plain/did:plc:one/blob-cid@png');
  } finally { globalThis.fetch=savedFetch; axios.defaults.adapter=savedAdapter; await pool.end(); }
});
