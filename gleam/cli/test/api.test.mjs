import assert from 'node:assert/strict';
import {test,afterEach} from 'node:test';
import {mkdtempSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {reads,toList,cell,settings,mpd,player} from '../dist/test-support.mjs';
delete process.env.ROCKSKY_IDENTIFIER;
delete process.env.ROCKSKY_PASSWORD;
const state=mkdtempSync(path.join(os.tmpdir(),'gleam-cli-api-'));process.env.ROCKSKY_STATE_DIR=state;process.env.ROCKSKY_CACHE_DIR=path.join(state,'cache');
const original={fetch:globalThis.fetch,log:console.log,error:console.error};
afterEach(()=>{globalThis.fetch=original.fetch;console.log=original.log;console.error=original.error;process.exitCode=0;});

test('read commands encode actor/search parameters and format source response shapes',async()=>{
 const urls=[],lines=[];console.log=x=>lines.push(x);
 globalThis.fetch=async(url,options)=>{urls.push(url);if(url.includes('feed.search'))return Response.json({hits:[{title:'Song',artist:'Artist',uri:'at://did:plc:a/app.rocksky.song/key',_federation:{indexUid:'tracks'}}]});return Response.json([{title:'Song',artist:'Artist',play_count:4}]);};
 await reads.run('tracks',toList(['alice.test']),{limit:'3'});assert.match(urls[0],/\/users\/alice.test\/tracks\?offset=0&size=3/);assert.match(lines[0],/1 Song Artist 4 plays/);
 await reads.run('search',toList(['A & B']),{tracks:true});assert.match(urls[1],/query=A%20%26%20B/);assert.match(lines[1],/https:\/\/rocksky.app\/did:plc:a\/song\/key/);
});
test('nowplaying falls back from Spotify, and public actor reads work without token file',async()=>{
 const lines=[],urls=[];console.log=x=>lines.push(x);
 globalThis.fetch=async url=>{urls.push(url);return Response.json(url.includes('spotify')?{}:{title:'Song',artist:'Artist',album:'Album'});};
 await reads.run('nowplaying',toList(['did:plc:a']),{});assert.equal(urls.length,2);assert.match(urls[0],/did=did%3Aplc%3Aa/);assert.deepEqual(lines,['Song - Artist\nAlbum']);
});
test('API failures are visible and set exit status',async()=>{
 let message;console.error=x=>{message=x;};globalThis.fetch=async()=>new Response('denied',{status:401});await reads.run('whoami',toList([]),{});assert.match(message,/401.*denied/);assert.equal(process.exitCode,1);
});

test('MPD status reports restored queue, transport preferences and correct song metadata',async()=>{
 const model={player:player.new$('')};const state=cell.get(model.player);state.queue=toList([{uploadId:'u1',title:'A\nB',artist:'Artist',duration:100000}]);state.index=0;state.position=5000;cell.set(model.player,state);
 const ctx=new mpd.Context(model.player,cell.new$(toList([])),cell.new$(1));
 let response=await mpd.execute(ctx,'status',toList([]));assert.ok(response.isOk());assert.match(response[0],/playlistlength: 1/);assert.match(response[0],/state: pause/);
 response=await mpd.execute(ctx,'currentsong',toList([]));assert.match(response[0],/Title: A B\n/);assert.match(response[0],/file: rocksky:upload:u1/);
 response=await mpd.execute(ctx,'bogus',toList([]));assert.equal(response.isOk(),false);assert.equal(response[0][0],5);
});
