import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Hono} from 'hono';
import jwt from 'jsonwebtoken';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='upload-ingest-test';process.env.JWT_SECRET='upload-ingest-secret';
const I=await import('../output/Rocksky.Uploads.Ingest/index.js');const App=await import('../output/Rocksky.Uploads.App/index.js');const AWS=await import('../output/Aws.S3/index.js');const {fromAff,toAffE}=await import('../output/Control.Promise/index.js');const run=a=>fromAff(a)();const aff=f=>toAffE(()=>Promise.resolve().then(f));
const user={id:'user',did:'did:plc:listener'};const authorization='Bearer '+jwt.sign({did:user.did},process.env.JWT_SECRET);const bytes=Buffer.from('ID3original');const tagged=Buffer.from('ID3retagged');
const metadata=()=>({common:{title:' Title ',artist:'Artist & Guest',album:' Album ',albumartist:'Album Artist',track:{no:2},disk:{no:0},genre:['rock'],composer:['Composer'],picture:[{format:'image/jpeg',data:Buffer.from('cover')}],lyrics:[{text:'lyrics'}],isrc:[' ISRC '],musicbrainz_trackid:'',musicbrainz_recordingid:'fallback',date:'2026-01-01',year:2026},format:{duration:2,sampleRate:44100},native:{}});
const track={id:'track',title:'Title',artist:'Artist & Guest',album:'Album',albumArtist:null,duration:2000,genre:'rock',key:null,bpm:null,acoustidFingerprint:null,albumArt:null};const upload={id:'upload',uploadedAt:new Date('2026-01-01T00:00:00Z')};
function setup(answers,meta=metadata(),overrides={}){const events=[],writes=[];const db={select(){const q={from(){return q},where(){return q},limit(){return q},async execute(){events.push('select');assert.ok(answers.length);return answers.shift()}};return q},insert(){const q={values(v){writes.push(v[0]);return q},returning(){return q},async execute(){events.push('insert');assert.ok(answers.length);return answers.shift()}};return q}};const data={};const ops={parse:b=>mime=>aff(()=>{events.push('parse');assert.equal(mime,'audio/mpeg');return meta}),gain:b=>ext=>aff(()=>{events.push('gain');assert.equal(ext,'mp3');return tagged}),cover:key=>b=>mime=>aff(()=>{events.push('cover');data.cover={key,b,mime}}),save:did=>payload=>aff(()=>{events.push('save');data.payload=payload;assert.equal(did,user.did);return true}),pause:aff(()=>events.push('pause')),store:i=>aff(()=>{events.push('store');data.storage=i;return 'provider'}),analyze:b=>ext=>id=>aff(()=>{events.push('analyze');data.analysis={b,ext,id}}),index:doc=>aff(()=>{events.push('index');data.index=doc}),...overrides};const app=new Hono();I.registerWith({db})(ops)(app)();return {app,events,writes,data}}
function request(app,content=bytes){const form=new FormData();form.set('file',new File([content],'a song.mp3',{type:'application/octet-stream'}));form.set('storage_provider_id','provider');return app.request('/track',{method:'POST',headers:{authorization},body:form})}
{
 const m=setup([[user],[],[],[track],[upload]]);const r=await request(m.app);assert.equal(r.status,200);assert.deepEqual(await r.json(),{uploadId:'upload',trackId:'track',track:{title:'Title',artist:'Artist & Guest',album:'Album',duration:2000,genre:'rock'}});await new Promise(setImmediate);
 assert.deepEqual(m.events.slice(0,10),['select','parse','gain','select','select','cover','save','pause','select','store']);assert.ok(m.events.includes('analyze'));assert.ok(m.events.includes('index'));
 assert.deepEqual(m.data.payload.lyrics,[{text:'lyrics'}]);assert.equal(m.data.payload.mbId,'');assert.equal(m.data.payload.isrc,'ISRC');assert.equal(m.data.payload.discNumber,1);assert.equal(m.data.payload.releaseDate.toISOString(),'2026-01-01T00:00:00.000Z');assert.equal(m.data.payload.lastfmLink,'https://www.last.fm/music/Artist%20%26%20Guest/_/Title');
 assert.equal(m.data.storage.bytes,tagged);assert.equal(m.data.storage.key,`music/user/${createHash('sha256').update(tagged).digest('hex')}.mp3`);assert.equal(m.writes[0].fileSize,tagged.length);assert.equal(m.writes[0].sampleRate,44100);assert.equal(m.writes[0].storageProviderId,'provider');assert.equal(m.data.index.album_artist,'Artist & Guest');assert.equal('year' in m.data.index,false);assert.equal(m.data.index.uploaded_at,upload.uploadedAt.getTime());
}
{
 const m=setup([[user],[{id:'duplicate'}]]);const r=await request(m.app);assert.equal(r.status,409);assert.equal((await r.json()).uploadId,'duplicate');assert.deepEqual(m.events,['select','parse','gain','select']);
}
{
 const meta=metadata();meta.common.replaygain_track_gain={dB:0};const m=setup([[user],[],[track],[{...track,key:'C',bpm:120,acoustidFingerprint:'fp'}],[upload]],meta,{cover:()=>()=>()=>aff(()=>{throw Error('cover failed')}),index:()=>aff(()=>{throw Error('index failed')})});const r=await request(m.app);assert.equal(r.status,200);await new Promise(setImmediate);assert.equal(m.events.includes('gain'),false);assert.equal(m.events.includes('save'),false);assert.equal(m.events.includes('pause'),false);assert.equal(m.events.includes('analyze'),false);assert.deepEqual(m.data.storage.bytes,bytes);
}
{
 const m=setup([[user],[],[]],metadata(),{save:()=>()=>aff(()=>false)});const r=await request(m.app);assert.equal(r.status,401);assert.equal(m.events.includes('cover'),true);assert.equal(m.events.includes('store'),false);assert.equal(m.events.includes('pause'),false);
}
{
 const invalid=setup([[user]]);const r=await request(invalid.app,Buffer.from('not audio'));assert.equal(r.status,400);assert.equal((await r.json()).error,'INVALID_FORMAT');assert.equal(invalid.events.includes('parse'),false);
 const parse=setup([[user]],metadata(),{parse:()=>()=>aff(()=>{throw Error('parse failed')})});assert.equal((await (await request(parse.app)).json()).error,'METADATA_PARSE_FAILED');
 const missing=setup([[user]],{common:{},format:{},native:{}});assert.equal((await (await request(missing.app)).json()).error,'NO_TAGS');
 const m=setup([[user],[user]]);const malformed=await m.app.request('/track',{method:'POST',headers:{authorization,'Content-Type':'application/json'},body:'{}'});assert.equal(malformed.status,400);assert.equal(await malformed.text(),'Invalid multipart form data');const absent=await m.app.request('/track',{method:'POST',headers:{authorization},body:new FormData()});assert.equal((await absent.json()).error,'NO_FILE');
}
{
 const app=App.app({})();for(const [method,path] of [['POST','/track'],['GET','/'],['GET','/queue'],['GET','/stream-token'],['GET','/x/stream'],['DELETE','/x']])assert.equal((await app.request(path,{method})).status,401);
 const commands=[],client={async send(c){commands.push(c.input)}};await run(AWS.putObjectWithMetadata(client)({bucket:'bucket',key:'key',body:bytes,contentType:'audio/mpeg',contentLength:bytes.length})({originalFilename:'a%20song.mp3',userId:'user',trackId:'track'}));assert.deepEqual(commands[0].Metadata,{originalFilename:'a%20song.mp3',userId:'user',trackId:'track'});
}
console.log('Upload ingestion: validation/statuses, ReplayGain-before-dedup, stored-byte hash, raw metadata, cover failure, save pacing, storage metadata and background isolation passed');
