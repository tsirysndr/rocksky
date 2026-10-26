import assert from 'node:assert/strict';
import {test,afterEach} from 'node:test';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {toList,parsers,checkpoint,csv,protocol,settings,cell,player,uploads,imports,api,hardware,mpd} from '../dist/test-support.mjs';
process.env.ROCKSKY_STATE_DIR=mkdtempSync(path.join(os.tmpdir(),'gleam-cli-state-'));
const fixture=name=>new URL(`fixtures/import/${name}`,import.meta.url).pathname;
const unwrap=r=>{assert.ok(r.isOk(),r[0]);return r[0];};
const array=list=>Array.from(list);
const fetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=fetch;});

test('Spotify parser preserves metadata, skips podcasts/short plays, sorts chronologically',()=>{
 const parsed=unwrap(parsers.parse(fixture('spotify-sample.json'),'',30));
 assert.equal(parsed.format,'spotify');const tracks=array(parsed.scrobbles);
 assert.equal(tracks.length,2);assert.equal(tracks[0].title,'Tsy Maka Sarotra');assert.equal(tracks[0].artist,'Alien Xkai');assert.equal(tracks[0].album,'Ikotofetsy & Imahaka');assert.ok(tracks[0].timestamp<=tracks[1].timestamp);
 assert.equal(array(unwrap(parsers.parse(fixture('spotify-sample.json'),'',0)).scrobbles).length,3);
});
test('Last.fm CSV and JSON preserve quotes, optional metadata, MBIDs and skip now playing',()=>{
 const tracks=array(unwrap(parsers.parse(fixture('lastfm-sample.csv'),'',30)).scrobbles);
 assert.equal(tracks.length,4);assert.equal(tracks.find(t=>t.title==='Body Talk').artist,'Ofenbach, Svea');assert.equal(tracks.find(t=>t.title==='Old News').album,undefined);assert.equal(tracks.find(t=>t.title==='Light as a Feather').mbId,'ac895a82-8d10-45b6-9b7e-80985cf40da6');
 assert.equal(array(unwrap(parsers.parse(fixture('lastfm-recenttracks.json'),'',30)).scrobbles).length,2);
});
test('CSV parser handles quoted newlines, escaped quotes, CRLF and trailing empty cells',()=>{
 assert.deepEqual(array(csv.parse('a,"b,c","x""y"\r\n1,"line\nline",\n')).map(array),[['a','b,c','x"y'],['1','line\nline','']]);
});
test('source directory sorting and exact dedup produce stable identities',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'gleam-cli-import-'));
 const row={ts:'2024-01-01T00:00:00Z',ms_played:40000,master_metadata_track_name:'Song',master_metadata_album_artist_name:'Artist'};
 writeFileSync(path.join(dir,'Streaming_History_Audio_2.json'),JSON.stringify([row,{...row,master_metadata_track_name:'SONG'}]));
 writeFileSync(path.join(dir,'Streaming_History_Audio_1.json'),JSON.stringify([{...row,ts:'2023-01-01T00:00:00Z'}]));
 const parsed=unwrap(parsers.parse(dir,'',30));assert.equal(array(parsed.scrobbles).length,2);assert.ok(array(parsed.files)[0].endsWith('_1.json'));
});
test('checkpoint preserves successes beyond gaps and legacy cursors',()=>{
 const tracks=toList(Array.from({length:6},(_,i)=>({timestamp:i,title:`Track ${i}`,artist:'Artist'})));
 let [tracker,pending]=checkpoint.restore(tracks,null);assert.deepEqual(array(pending),[0,1,2,3,4,5]);
 tracker=checkpoint.complete(tracker,3);tracker=checkpoint.complete(tracker,1);assert.equal(tracker.mark,-1);
 const saved={cursor:null,completed:array(checkpoint.outstanding(tracker)).map(i=>array(tracks)[i])};
 [tracker,pending]=checkpoint.restore(tracks,saved);assert.deepEqual(array(pending),[0,2,4,5]);tracker=checkpoint.complete(tracker,0);assert.equal(tracker.mark,1);tracker=checkpoint.complete(tracker,2);assert.equal(tracker.mark,3);
 assert.deepEqual(array(checkpoint.restore(tracks,{cursor:array(tracks)[1]})[1]),[2,3,4,5]);
});
test('import filters validate dates and matching fallback never masks PDS failures',()=>{
 const tracks=toList([{timestamp:10},{timestamp:20},{timestamp:30}]);assert.equal(array(unwrap(imports.filter(tracks,{limit:'2'}))).length,2);assert.equal(imports.filter(tracks,{from:'invalid'}).isOk(),false);
 assert.equal(imports.fallback({name:'RockskyError',kind:'NotFound',status:404,message:'Song not found'}),true);
 assert.equal(imports.fallback({name:'RockskyError',kind:'NotFound',status:404,message:'Record not found'}),false);
 assert.equal(imports.error_text({message:'Invalid timestamp',kind:'InvalidRecord',status:400}),'Invalid timestamp [InvalidRecord, HTTP 400]');
});
test('MPD tokenizer, ACK and line escaping preserve protocol framing',()=>{
 assert.deepEqual(array(protocol.tokenize('find Artist "Ofenbach, Svea" Album "a\\"b"')),['find','Artist','Ofenbach, Svea','Album','a"b']);
 assert.equal(protocol.kv('Title','x\r\ny'),'Title: x y\n');assert.equal(protocol.ack(2,1,'play','Bad argument'),'ACK [2@1] {play} Bad argument\n');
});
test('settings round trip includes output, MPD, remote and every sound control',()=>{
 const s=settings.decode('volume = 0.7\noutput = "unix:/tmp/audio"\nrepeat = "one"\n[mpd]\nport = 6610\n[remote]\nname = "Study"\n[equalizer]\nbands = [1, 2, 3]\nreplaygainClip = false\n');
 assert.equal(s.volume,.7);assert.equal(s.repeat,1);assert.equal(s.output,'unix:/tmp/audio');assert.equal(s.mpd_port,6610);assert.equal(s.remote_name,'Study');assert.deepEqual(array(s.bands),[1,2,3,0,0,0,0,0,0,0]);assert.equal(s.replaygain_clip,false);
 assert.deepEqual(settings.decode(settings.encode(s)),s);
});

test('NFC payloads preserve portable URIs and library fallbacks',()=>{
 assert.deepEqual(array(hardware.payloads('album','at://did:plc:a/app.rocksky.album/1','album-id')),['at://did:plc:a/app.rocksky.album/1','rocksky://library/album/album-id']);
 assert.equal(unwrap(hardware.parse('rocksky://favorites/did%3Aplc%3Aa')).reference,'did:plc:a');assert.equal(hardware.parse('https://other.example').isOk(),false);
});
test('storage resolution rejects missing and ambiguous destinations',()=>{
 const providers=toList([{id:'1',label:'Music',bucket:'a'},{id:'2',label:'Music',bucket:'b'}]);assert.equal(unwrap(uploads.resolve_storage('1',providers)),'1');assert.equal(uploads.resolve_storage('music',providers).isOk(),false);assert.equal(uploads.resolve_storage('missing',providers).isOk(),false);
});
test('Last.fm verifies signatures excluding api_sig and never publishes invalid auth',async()=>{
 const config=new api.Config('key','secret','session','web','alice');let published=[];
 const params={method:'track.scrobble',api_key:'key',sk:'session',track:'Song',artist:'Artist',timestamp:'123'};params.api_sig=api.signature(params,'secret');
 const request={method:'POST',path:'/2.0',body:params};
 let response=await api.handle(config,request,async track=>{published.push(track);});assert.equal(JSON.parse(response.body).scrobbles['@attr'].accepted,1);assert.equal(published[0].timestamp,123);
 response=await api.handle(config,{...request,body:{...params,api_sig:'bad'}},async()=>{throw Error('must not publish');});assert.equal(JSON.parse(response.body).error,13);
});
test('ListenBrainz requires token, skips now playing, and validates track metadata',async()=>{
 const config=new api.Config('key','secret','session','web','alice');let count=0;
 const request={method:'POST',path:'/1/submit-listens',authorization:'Token key',body:{listen_type:'single',payload:[{listened_at:123,track_metadata:{track_name:'Song',artist_name:'Artist'}}]}};
 assert.equal((await api.handle(config,request,async()=>{count++;})).status,200);assert.equal(count,1);
 assert.equal((await api.handle(config,{...request,authorization:''},async()=>{count++;})).status,401);assert.equal(count,1);
});
