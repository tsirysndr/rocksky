import assert from 'node:assert/strict';
import {test} from 'node:test';
import sharp from 'sharp';
import {Ok,toList} from '../build/dev/javascript/rocksky_api/gleam.mjs';
import {Some,None} from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';
import {Draft,Artist,publish,image_type} from '../build/dev/javascript/rocksky_api/rocksky_api/scripts/event.mjs';
import {describe} from '../build/dev/javascript/rocksky_api/rocksky_api/error.mjs';
test('Event publishing uploads poster dimensions and links music to the created calendar record',async()=>{
 const original=globalThis.fetch;const records=[];const uploads=[];
 const png=await sharp({create:{width:4,height:3,channels:3,background:'red'}}).png().toBuffer();
 globalThis.fetch=async(url,init)=>new Response(init?.method==='HEAD'?null:png,{headers:{'Content-Type':'image/png'}});
 const blob={$type:'blob',ref:{$link:'bafk-test'},mimeType:'image/png',size:png.length};
 const agent={com:{atproto:{repo:{uploadBlob:async(bytes,opts)=>{uploads.push({bytes,opts});return {data:{blob}};},createRecord:async input=>{records.push(input);return {data:{uri:`at://did:u/${input.collection}/one`,cid:`cid-${records.length}`}};}}}}};
 const none=new None();
 const draft=new Draft('Live',new Some('Description'),'2026-12-01T20:00:00.000Z',none,'community.lexicon.calendar.event#inperson','community.lexicon.calendar.event#scheduled',toList([]),new Some('https://venue.test'),'concert',new Some('rock'),toList(['live']),toList([new Artist('Artist',new Some('at://did:u/app.rocksky.artist/a'),'headliner',none,none,none)]),toList([['songkick','123']]),new Some('https://tickets.test'),new Some('https://poster.test/image.png'),'2026-10-01T00:00:00.000Z');
 try {
  const type=await image_type('https://poster.test/image.png');assert.equal(type[0][0],'image/png');
  const result=await publish(agent,'did:u',draft);assert.ok(result instanceof Ok,result instanceof Ok?'':describe(result[0]));
  assert.equal(uploads.length,1);assert.deepEqual(Buffer.from(uploads[0].bytes),png);assert.equal(uploads[0].opts.encoding,'image/png');
  assert.equal(records.length,2);const [calendar,music]=records.map(r=>r.record);
  assert.equal(calendar.name,'Live');assert.deepEqual(calendar.media[0].aspect_ratio,{width:4,height:3});assert.deepEqual(calendar.media[0].content,blob);
  assert.deepEqual(music.subject,{uri:'at://did:u/community.lexicon.calendar.event/one',cid:'cid-1'});assert.equal(music.artists[0].role,'headliner');assert.deepEqual(music.externalIds,{songkick:'123'});assert.equal('endsAt' in calendar,false);
  globalThis.fetch=async()=>new Response('unavailable',{status:503});
  assert.equal((await image_type('https://poster.test/image.webp'))[0][0],'image/webp');
  globalThis.fetch=async()=>new Response('not an image',{headers:{'content-type':'text/html'}});
  assert.ok((await image_type('https://poster.test/image.png'))[0] instanceof None);
 }finally{globalThis.fetch=original;}
});
