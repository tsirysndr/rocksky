import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PgDialect} from 'drizzle-orm/pg-core';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='import-test';
const T=await import('../output/Rocksky.Scripts.TypesenseImport/index.js');const {fromAff,toAffE}=await import('../output/Control.Promise/index.js');const run=a=>fromAff(a)();const aff=f=>toAffE(()=>Promise.resolve().then(f));const dialect=new PgDialect();
assert.deepEqual(T.options([]),{includeSearch:true,includeLibrary:false,reset:false});assert.deepEqual(T.options(['--only','library','--reset']),{includeSearch:false,includeLibrary:true,reset:true});assert.deepEqual(T.options(['--library']),{includeSearch:true,includeLibrary:true,reset:false});
{
 const offsets=[],indexed=[];const result=await run(T.importCollection('tracks')(1001)(offset=>limit=>aff(()=>{offsets.push(offset);assert.equal(limit,500);return offset===0?Array(500).fill(1):offset===500?Array(500).fill(2):[3]}))(rows=>aff(()=>{indexed.push(rows[0]);if(rows[0]===2)throw new Error('batch failed')})));assert.deepEqual(result,{imported:501,failed:500});assert.deepEqual(offsets,[0,500,1000]);assert.deepEqual(indexed,[1,2,3]);
 let calls=0;assert.deepEqual(await run(T.importCollection('empty')(0)(()=>{throw new Error('zero fetched')})(()=>{throw new Error('zero indexed')})),{imported:0,failed:0});await run(T.importCollection('short')(1000)(at=>size=>aff(()=>{calls++;return []}))(()=>{throw new Error('empty indexed')}));assert.equal(calls,1);
}
const date=new Date('2020-01-01T00:00:00Z');const row=id=>({upload:{id,userId:'user',r2Key:'key',mimeType:'audio/flac',fileSize:10,uploadedAt:date,originalFilename:null},track:{id:'track',title:'Title',artist:'Artist',album:'Album',albumArtist:null,genre:null,composer:'',duration:10,albumArt:null,mbId:null,trackNumber:0,discNumber:null}});
const doc=T.libraryDocument(row('upload'));assert.equal(doc.album_artist,'Artist');assert.equal(doc.composer,'');assert.equal(doc.track_number,0);assert.equal(doc.uploaded_at,date.getTime());assert.equal(doc.year,undefined);assert.equal(doc.genre,undefined);assert.equal(doc.original_filename,undefined);
{
 let count=true;const calls=[],db={select(){const counting=count;count=false;const q={from(){return q},innerJoin(){return q},orderBy(c){assert.equal(c.name,"uploaded_at");return q},limit(n){assert.equal(n,500);return q},offset(n){assert.equal(n,0);return q},async execute(){return counting?[{value:3}]:[row('a'),row('b'),row('c')]}};return q}};
 const result=await run(T.importLibraryTracks({db})(document=>aff(()=>{calls.push(document.id);if(document.id==='b')throw new Error('one failed')})));assert.deepEqual(result,{imported:2,failed:1});assert.deepEqual(calls.sort(),['a','b','c']);
}
console.log('Typesense import: CLI selection, 500-row batch failure accounting, empty pages, sparse library fields, numeric timestamps and settled per-document failures passed');
