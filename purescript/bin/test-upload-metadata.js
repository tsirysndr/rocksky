import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='upload-metadata-test';
const M=await import('../output/Rocksky.Uploads.Metadata/index.js');const {Left,Right}=await import('../output/Data.Either/index.js');const {Nothing}=await import('../output/Data.Maybe/index.js');const P=await import('../output/MusicMetadata/index.js');const {fromAff}=await import('../output/Control.Promise/index.js');
for(const [bytes,mime] of [[[73,68,51],'audio/mpeg'],[[255,251],'audio/mpeg'],[[255,243],'audio/mpeg'],[[255,242],'audio/mpeg'],[[102,76,97,67],'audio/flac'],[[79,103,103,83],'audio/ogg'],[[82,73,70,70],'audio/wav'],[[70,79,82,77],'audio/aiff'],[[0,0,0,0,102,116,121,112],'audio/mp4']])assert.equal(M.detectMime(Buffer.from(bytes))().value0,mime);
for(const bytes of [[],[73,68],[255],[0,0,0,0,102,116,121],[1,2,3,4]])assert.ok(M.detectMime(Buffer.from(bytes))() instanceof Nothing);
const valid=()=>({common:{title:' Title ',artist:' Artist ',album:' Album ',picture:[{format:'image/jpeg',data:Buffer.from('cover')}],disk:{no:0},replaygain_track_gain:{dB:0}},format:{duration:1.2345},native:{}});
const result=M.validate(valid());assert.ok(result instanceof Right);assert.deepEqual({...result.value0,releaseDate:null},{title:'Title',artist:'Artist',album:'Album',albumArtist:'Artist',durationMs:1235,discNumber:1,releaseDate:null,hasGainTag:true});
assert.equal(M.validate({common:{},format:{},native:{}}).value0.error,'NO_TAGS');
{
 const m=valid();m.common={title:' ',artist:'a'.repeat(257),album:'b'.repeat(257),albumartist:'c'.repeat(257),picture:[]};m.format.duration=0;const result=M.validate(m);assert.ok(result instanceof Left);assert.deepEqual(result.value0.missingFields,['title','artist (too long, max 256 chars)','album (too long, max 256 chars)','duration','album art','albumArtist (too long, max 256 chars)']);
}
{
 const m=valid();m.format.duration=0;m.native={ID3:[{id:'TLEN',value:'1234ms'}]};assert.equal(M.validate(m).value0.durationMs,1234);m.native.ID3[0].value='invalid';assert.ok(Number.isNaN(M.validate(m).value0.durationMs),'source accepts NaN from malformed TLEN because NaN < 1 is false');
 m.common.date='2026';m.common.originaldate='2025-01-01';assert.ok(M.validate(m).value0.releaseDate instanceof Nothing);m.common.date=null;assert.equal(M.validate(m).value0.releaseDate.value0,'2025-01-01');m.common.disk.no=-1;assert.equal(M.validate(m).value0.discNumber,-1);
}
{
 const m=valid();m.common.title='😀'.repeat(257);assert.deepEqual(M.validate(m).value0.missingFields,['title (too long, max 512 chars)']);
}
assert.equal(M.metaSha256('TITLE')('Artist')('Album'),createHash('sha256').update('title - artist - album').digest('hex'));assert.equal(M.coverMd5('Artist')('Album'),createHash('md5').update('artist - album').digest('hex'));assert.equal(M.contentSha256(Buffer.from('audio')),createHash('sha256').update('audio').digest('hex'));
// Exercise the raw parser on a valid PCM WAV without external tools or services.
const wav=Buffer.alloc(46);wav.write('RIFF');wav.writeUInt32LE(38,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(2,40);
const parsed=await fromAff(P.parseUploadBuffer(wav)('audio/wav'))();assert.equal(parsed.format.sampleRate,8000);assert.equal(typeof parsed.native,'object');assert.equal(M.validate(parsed).value0.error,'NO_TAGS');
console.log('Upload metadata: magic bytes, hashes, raw parser, tag/UTF16 limits, TLEN fallback, source NaN behavior and metadata defaults passed');
