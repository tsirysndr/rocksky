import {afterEach,expect,test} from 'bun:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {RockskyClient} from '../runtime/client.js';
import {parseNfcPayload,nfcPayloadsFor,nfcFavoritesPayloads,encodeNdefUris,decodeNdefUris} from '../runtime/lib/nfc.js';
import {encodeAtUri,decodeAtUri,encodeFavorites,decodeFavorites} from '../runtime/lib/aturi.js';
import {tokenize,ackLine,kv} from '../runtime/mpd/protocol.js';
import {DEFAULT_SETTINGS} from '../runtime/tui/settings.js';
import * as Settings from '../../output/Rocksky.Cli.Tui.Settings/index.js';
import * as Model from '../../output/Rocksky.Cli.Tui.Model/index.js';
import * as Mpd from '../../output/Rocksky.Cli.Mpd.Commands/index.js';
import {getAlbum,createPlaylist,addTrackToPlaylist,exportQueue} from '../runtime/tui/navidrome.js';
import {parseImport,parseCsv} from '../runtime/lib/importParsers.js';
import {fromAff} from '../../output/Control.Promise/index.js';
import {runPool} from '../../output/Rocksky.Cli.Command.Import/index.js';
import {toAffE} from '../../output/Control.Promise/index.js';

const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
const root=path.dirname(fileURLToPath(new URL('../index.js',import.meta.url)));
const run=(...args)=>spawnSync(process.execPath,[path.join(root,'index.js'),...args],{cwd:root,encoding:'utf8',timeout:15000});

test('CLI exposes every command and nested integration without initializing state',()=>{
 const main=run('--help');
 assert.equal(main.status,0,main.stderr);
 for(const command of ['login','whoami','nowplaying','scrobbles','search','stats','artists','albums','tracks','scrobble','create','mcp','sync','scrobble-api','mpd','nfc','card','import','upload','tui']) assert.ok(main.stdout.includes(command));
 for(const args of [['create','apikey'],['nfc','status'],['nfc','read'],['nfc','write'],['card','read'],['card','write'],['import'],['mcp'],['mpd'],['tui'],['upload']]) {
  const result=run(...args,'--help');assert.equal(result.status,0,result.stderr);assert.ok(result.stdout.includes('Usage: rocksky'));
 }
 assert.equal(run('--version').stdout.trim(),'0.11.3');
 assert.notEqual(run('unknown-command').status,0);
 assert.notEqual(run('scrobble').status,0);
});

test('TUI entrypoint loads and reports missing interactive terminal clearly',()=>{
 const result=run('tui');assert.equal(result.status,1);assert.ok(result.stderr.includes('requires an interactive terminal'),result.stderr);
});

test('API client preserves authentication, encoded queries and actor date ranges',async()=>{
 const calls=[];
 globalThis.fetch=async(input,init)=>{calls.push([String(input),init]);return Response.json({tracks:[{title:'Track'}]});};
 const client=new RockskyClient('session');
 await client.search('Artist & Name',{size:15});
 assert.equal(new URL(calls[0][0]).searchParams.get('query'),'Artist & Name');
 assert.equal(calls[0][1].headers.Authorization,'Bearer session');
 const songs=await client.getActorSongs('did:plc:test',{skip:2,limit:5,startDate:'2024-01-01',endDate:'2025-01-01'});
 assert.deepEqual(songs,[{title:'Track'}]);
 const params=new URL(calls[1][0]).searchParams;
 assert.equal(params.get('offset'),'2');assert.equal(params.get('limit'),'5');assert.equal(params.get('startDate'),'2024-01-01');
 assert.equal(params.get('endDate'),'2025-01-01');
});

test('mutations keep request bodies and tolerate empty successful deletes',async()=>{
 let request;
 globalThis.fetch=async(url,init)=>{request={url:String(url),init};return new Response(null,{status:204});};
 assert.deepEqual(await new RockskyClient('test').deleteUploadByTrack('track-1'),{});
 assert.equal(request.init.method,'DELETE');
 globalThis.fetch=async(url,init)=>{request={url:String(url),init};return Response.json({name:'key'});};
 await new RockskyClient('test').createApiKey('key','description');
 assert.deepEqual(JSON.parse(request.init.body),{name:'key',description:'description'});
 await new RockskyClient('test').matchSong('Title','Artist','Album & Deluxe');
 assert.equal(new URL(request.url).searchParams.get('album'),'Album & Deluxe');
});

test('library procedures mirror writes through Rocksky and surface PDS failures',async()=>{
 const calls=[];
 globalThis.fetch=async(url,init)=>{calls.push([String(url),init]);return Response.json({playlist:{id:'one'}});};
 assert.equal(await createPlaylist('token','Favorites'),'one');
 assert.ok(calls[0][0].includes('/xrpc/app.rocksky.library.createPlaylist'));
 await addTrackToPlaylist('token','one','song');
 assert.deepEqual(JSON.parse(calls[1][1].body),{playlistId:'one',songIdToAdd:'song'});
 globalThis.fetch=async()=>Response.json({atprotoError:'PDS unavailable'});
 await assert.rejects(createPlaylist('token','Favorites'),/PDS unavailable/);
});

test('queue exports keep successful additions when one song fails',async()=>{
 globalThis.fetch=async(url,init)=>{
  if(String(url).endsWith('createPlaylist')) return Response.json({playlist:{id:'list'}});
  if(JSON.parse(init.body).songIdToAdd==='bad')return Response.json({message:'missing'},{status:404});
  return Response.json({});
 };
 assert.deepEqual(await exportQueue('token','Queue',['one','bad','two']),{id:'list',added:2,failed:1});
});

test('Subsonic singleton albums normalize song entries and use encoded credentials',async()=>{
 globalThis.fetch=async url=>{
  assert.equal(new URL(url).searchParams.get('p'),'key & token');
  return Response.json({'subsonic-response':{status:'ok',album:{id:'album',song:{id:'song'}}}});
 };
 const result=await getAlbum({handle:'alice',apiKey:'key & token'},'album');
 assert.deepEqual(result.entries,[{id:'song'}]);
});

test('settings parse and serialize preserve output, remote, MPD and all equalizer fields',()=>{
 assert.deepEqual(Settings.parseSettings(Settings.serialize(DEFAULT_SETTINGS)),DEFAULT_SETTINGS);
 const settings=Settings.parseSettings('volume = 0.5\nrepeat = "one"\noutput = "tcp:127.0.0.1:5555"\n[mpd]\nenabled = true\nport = 6601\n[remote]\nname = "Studio"\n[equalizer]\nbands = [1,2,3]\nreplaygainClip = false\n');
 assert.equal(settings.volume,0.5);assert.equal(settings.repeat,'one');assert.equal(settings.output,'tcp:127.0.0.1:5555');
 assert.equal(settings.mpd.port,6601);assert.equal(settings.remote.name,'Studio');
 assert.deepEqual(settings.equalizer.bands,[1,2,3,0,0,0,0,0,0,0]);assert.equal(settings.equalizer.replaygainClip,false);
 assert.equal(Settings.parseSettings('repeat = "invalid"\nvolume = "bad"').volume,0.9);
});

test('playback scrobbles only once per play after the half-track or four-minute threshold',()=>{
 const item={uploadId:'one',title:'Track',artist:'Artist',duration:600000};
 const tick=(state,token,position,duration=600000,index=0)=>Model.scrobbleTick(state)(token)({state:'playing',index,position_ms:position,duration_ms:duration})(item);
 let state=Model.initialScrobbleState;
 let result=tick(state,'token',239999);assert.equal(result.submit,false);
 result=tick(result.state,'token',240000);assert.equal(result.submit,true);
 result=tick(result.state,'token',300000);assert.equal(result.submit,false);
 assert.equal(tick(result.state,'token',60000,120000,1).submit,true);
 assert.equal(tick(state,'token',20000,29000).submit,false);
 assert.equal(tick(state,'',240000).submit,false);
 assert.equal(Model.session({queue:[]}),null);
 assert.deepEqual(Model.session({queue:[item]}),{queue:[item],index:0,positionMs:0});
});

test('MPD tokenization, escaped arguments, errors and restored-session status are compatible',()=>{
 assert.deepEqual(tokenize('find artist "A \\"quote\\"" album "B\\\\C"'),['find','artist','A "quote"','album','B\\C']);
 assert.equal(kv('Title','a\r\nb\nc'),'Title: a b c\n');
 assert.equal(ackLine(5,2,'bad','unknown'),'ACK [5@2] {bad} unknown\n');
 const lines=Mpd.statusLines(null)({index:0,positionMs:12345})([{duration:60000}])(0.9)(2)(true)(7).join('');
 for(const expected of ['volume: 90','repeat: 1','random: 1','state: pause','song: 0','elapsed: 12.345','duration: 60.000'])assert.ok(lines.includes(expected),lines);
 assert.equal(Mpd.mpdVolume(NaN),0);assert.equal(Mpd.finiteMs(-1),0);
});

test('NFC targets and compact card payloads remain portable',()=>{
 const uri='at://did:plc:abcdefghijklmnopqrstuvwx/app.rocksky.album/3lzytq7gzrs2a';
 assert.deepEqual(parseNfcPayload(uri),{kind:'albumUri',uri});
 assert.deepEqual(parseNfcPayload('rocksky://library/playlist/hello%20world'),{kind:'playlist',id:'hello world'});
 assert.deepEqual(parseNfcPayload('rocksky://favorites/did%3Aplc%3Atest'),{kind:'favorites',did:'did:plc:test'});
 assert.equal(parseNfcPayload('https://example.com'),null);
 assert.deepEqual(nfcPayloadsFor('album',{uri,id:'local'}),[uri,'rocksky://library/album/local']);
 assert.deepEqual(nfcFavoritesPayloads(' did:plc:test '),['rocksky://favorites/did%3Aplc%3Atest']);
 assert.equal(decodeAtUri(encodeAtUri(uri)).uri,uri);
 const favorites='did:plc:abcdefghijklmnopqrstuvwx';
 assert.equal(decodeFavorites(encodeFavorites(favorites)).uri,'rocksky://favorites/'+favorites);
});

test('CSV parser handles quotes, embedded line breaks, CRLF and large histories',()=>{
 assert.deepEqual(parseCsv('a,"b\nq","say ""hi"""\r\n'),[['a','b\nq','say "hi"']]);
 assert.equal(parseCsv('a,b,c\n'.repeat(20000)).length,20000);
});

test('import worker pool honors concurrency and processes every item',async()=>{
 let active=0,maximum=0;const seen=[];
 const worker=item=>index=>toAffE(()=>new Promise(resolve=>{
  active++;maximum=Math.max(maximum,active);
  setTimeout(()=>{seen.push([item,index]);active--;resolve();},1);
 }));
 await fromAff(runPool([10,11,12,13,14])(2)(worker))();
 assert.equal(maximum,2);assert.deepEqual(seen.sort((a,b)=>a[1]-b[1]),[[10,0],[11,1],[12,2],[13,3],[14,4]]);
});
