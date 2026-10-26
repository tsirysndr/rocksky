import assert from 'node:assert/strict';
import {mock} from 'bun:test';
import {PassThrough,Writable} from 'node:stream';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {stripVTControlCharacters} from 'node:util';
const directory=await mkdtemp(path.join(os.tmpdir(),'rocksky-cli-tui-'));
const originalHome=os.homedir;
const originalFetch=globalThis.fetch;
os.homedir=()=>directory;
globalThis.fetch=async(input,init)=>String(input).startsWith('data:')?originalFetch(input,init):Response.json({scrobbles:[],tracks:[],artists:[],albums:[]});
mock.module('../runtime/tui/nfc.js',()=>({startNfcWatch:()=>()=>{},closeNfc:()=>{},writeAlbumTag:async()=>{},writePlaylistTag:async()=>{},writeFavoritesTag:async()=>{}}));
mock.module('../runtime/tui/mpris.js',()=>({initMpris:async()=>null}));
const React=await import('react');
const {render}=await import('ink');
const {QueryClientProvider}=await import('@tanstack/react-query');
const {queryClient}=await import('../runtime/tui/queryClient.js');
const {App}=await import('../runtime/tui/App.js');
const stdin=new PassThrough();
stdin.isTTY=true;stdin.setRawMode=()=>{};stdin.ref=()=>{};stdin.unref=()=>{};
let output='';
const stdout=new Writable({write(chunk,_encoding,done){output+=chunk.toString();done();}});
stdout.columns=100;stdout.rows=32;stdout.isTTY=true;
let app;
try {
 app=render(React.createElement(QueryClientProvider,{client:queryClient},React.createElement(App)),{stdin,stdout,stderr:stdout,exitOnCtrlC:false,patchConsole:false});
 await new Promise(resolve=>setTimeout(resolve,300));
 const screen=stripVTControlCharacters(output);
 for(const label of ['Global Scrobbles','My Music','Profile','help'])assert.ok(screen.includes(label),`Missing ${label}: ${screen}`);
 stdin.write('?');
 await new Promise(resolve=>setTimeout(resolve,100));
 assert.ok(stripVTControlCharacters(output).includes('quit'));
 console.log('TSX TUI rendered successfully with the PureScript core and mocked network/devices.');
} finally {
 app?.unmount();queryClient.clear();stdin.destroy();stdout.destroy();
 os.homedir=originalHome;globalThis.fetch=originalFetch;
 await rm(directory,{recursive:true,force:true});
}
