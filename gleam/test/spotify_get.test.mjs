import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Ok} from '../build/dev/javascript/rocksky_api/gleam.mjs';
import {None,Some} from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';
import {spotify_get} from '../build/dev/javascript/rocksky_api/rocksky_api/lib/spotify_get.mjs';
test('Spotify fetch aborts real requests, respects retry limits and rejects malformed bodies',async()=>{
 const original=globalThis.fetch;let calls=0;
 try {
  globalThis.fetch=async(url,opts)=>{calls++;assert.ok(opts.signal);return Response.json({ok:true});};assert.ok(await spotify_get('https://spotify.test','token','search',new None()) instanceof Ok);
  globalThis.fetch=async()=>{calls++;return new Response('',{status:429,headers:{'retry-after':'30'}});};let before=calls;let result=await spotify_get('https://spotify.test','token','search',new None());assert.equal(result[0].status,429);assert.equal(calls-before,1);
  globalThis.fetch=async()=>{calls++;return new Response('',{status:401});};before=calls;result=await spotify_get('https://spotify.test','token','search',new None());assert.equal(result[0].status,401);assert.equal(calls-before,1);
  globalThis.fetch=async()=>new Response('bad json',{status:200});result=await spotify_get('https://spotify.test','token','search',new None());assert.equal(result[0].status,200);assert.match(result[0].message,/malformed/);
  const controller=new AbortController();controller.abort();before=calls;assert.ok(!(await spotify_get('https://spotify.test','token','search',new Some(controller.signal)) instanceof Ok));assert.equal(calls,before);
  calls=0;globalThis.fetch=async()=>{calls++;if(calls<3)return new Response('',{status:429,headers:{'retry-after':'0.001'}});return Response.json({ok:true});};assert.ok(await spotify_get('https://spotify.test','token','search',new None()) instanceof Ok);assert.equal(calls,3);
  calls=0;globalThis.fetch=async()=>{calls++;throw new DOMException('Timed out','TimeoutError');};assert.ok(!(await spotify_get('https://spotify.test','token','search',new None()) instanceof Ok));assert.equal(calls,1);
 } finally {globalThis.fetch=original;}
});
