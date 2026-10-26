import {test} from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {mpd,player} from '../dist/test-support.mjs';

test('MPD sockets support lists, idle cancellation and notifications, browsing and binary art',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gleam-mpd-'));
 process.env.ROCKSKY_STATE_DIR=tmp;
 const rows=[{uploadId:'one',trackId:'t',title:'Song',artist:'Singer',albumArtist:'Artist',album:'Album',duration:123000,albumArt:'https://example.invalid/cover'}];
 fs.writeFileSync(path.join(tmp,'mpd-library.json'),JSON.stringify(rows));
 fs.writeFileSync(path.join(tmp,'tui-session.json'),JSON.stringify({queue:rows,index:0,positionMs:1000}));
 const original=global.fetch;global.fetch=async()=>new Response(Uint8Array.from([0,128,255,10,1]),{headers:{'content-type':'image/png'}});
 let close,socket,control;
 const connect=port=>new Promise((resolve,reject)=>{const s=net.connect(port,'127.0.0.1');s.once('error',reject);s.once('connect',()=>resolve(s));});
 const reader=s=>{
  let data=Buffer.alloc(0);s.on('data',chunk=>{data=Buffer.concat([data,chunk]);});
  return {async take(marker='OK\n'){
   const end=Date.now()+3000;
   while(!data.includes(marker)){if(Date.now()>end)throw new Error(`Timed out: ${data}`);await new Promise(r=>setTimeout(r,10));}
   const length=data.indexOf(marker)+Buffer.byteLength(marker);const result=data.subarray(0,length);data=data.subarray(length);return result;
  },get bytes(){return data.length;}};
 };
 try{
  const started=await mpd.start(player.new$(''),{port:0,bind:'127.0.0.1'},()=>{});close=started[1];
  socket=await connect(started[0]);const r=reader(socket);assert.match((await r.take('\n')).toString(),/OK MPD 0.23.5/);
  socket.write('command_list_ok_begin\nstatus\ncurrentsong\ncommand_list_end\n');
  const list=(await r.take('\nOK\n')).toString();assert.equal((list.match(/list_OK/g)||[]).length,2);assert.match(list,/Title: Song/);
  socket.write('lsinfo\n');assert.equal((await r.take()).toString(),'directory: Artists\ndirectory: Albums\ndirectory: Playlists\nOK\n');
  socket.write('lsinfo "Artists/Artist/Album"\n');assert.match((await r.take()).toString(),/file: rocksky:upload:one/);
  socket.write('idle mixer\n');await new Promise(r=>setTimeout(r,550));assert.equal(r.bytes,0);
  socket.write('noidle\n');assert.equal((await r.take()).toString(),'OK\n');
  socket.write('idle mixer\n');control=await connect(started[0]);const c=reader(control);await c.take('\n');
  control.write('setvol 37\n');await c.take();assert.equal((await r.take()).toString(),'changed: mixer\nOK\n');
  socket.write('binarylimit 3\n');await r.take();
  socket.write('readpicture "rocksky:upload:one" 0\n');
  assert.deepEqual(await r.take('\nOK\n'),Buffer.concat([Buffer.from('size: 5\ntype: image/png\nbinary: 3\n'),Buffer.from([0,128,255]),Buffer.from('\nOK\n')]));
  socket.write('albumart "rocksky:upload:one" 3\n');
  assert.deepEqual(await r.take('\nOK\n'),Buffer.concat([Buffer.from('size: 5\nbinary: 2\n'),Buffer.from([10,1]),Buffer.from('\nOK\n')]));
 }finally{socket?.destroy();control?.destroy();close?.();global.fetch=original;fs.rmSync(tmp,{recursive:true,force:true});}
});
