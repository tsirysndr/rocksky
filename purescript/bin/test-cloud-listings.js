import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {getTableName} from 'drizzle-orm';
import {PgDialect} from 'drizzle-orm/pg-core';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='cloud-test';
const {fromAff}=await import('../output/Control.Promise/index.js');const {Just,Nothing}=await import('../output/Data.Maybe/index.js');const run=a=>fromAff(a)();const dialect=new PgDialect();
const date=new Date('2026-01-02T00:00:00Z');
const parent={id:'parent',name:'Music',createdAt:date,updatedAt:date,xataVersion:'4'};
const item={id:'child',name:'A',fileId:'f',path:'/Music/A',parentId:'parent',directoryId:'parent',trackId:null,createdAt:date,updatedAt:date};
for(const provider of ['Dropbox','Googledrive']){
 const mod=await import('../output/Rocksky.Xrpc.App.Rocksky.'+provider+'.GetFiles/index.js');
 for(const at of [Nothing.value,new Just(' /Music/ '),new Just('/Music/')]){
  for(const filesOnly of [false,true]){
   const queries=[];const db={select(){let table;const q={from(t){table=getTableName(t);return q},leftJoin(){return q},where(c){queries.push(dialect.sqlToQuery(c));return q},orderBy(c){assert.match(dialect.sqlToQuery(c).sql,/name.*asc/);return q},async execute(){return table.endsWith('directories')&&filesOnly?[]:[{item,parent,parent_dir:parent}]}};return q}};
   const result=await run(mod.retrieve({db})(at)(new Just('did:plc:test')));
   const path=at instanceof Just?at.value0.replace(/\/$/,'').trim():'/Music';
   for(const q of queries){assert.deepEqual(q.params,['did:plc:test',path,at instanceof Just?at.value0.trim():'']);assert.match(q.sql,/"users"\."did"/);assert.match(q.sql,/"parent"\."path"/);assert.match(q.sql,/"parent"\."file_id"/);}
   assert.deepEqual(result.directory,{id:'parent',name:'Music'});assert.equal(result.parentDirectory.xataVersion,provider==='Googledrive'?'4':undefined);assert.equal(result.files[0].createdAt,date.toISOString());assert.equal(result.files[0].trackId,null);assert.equal(result.directories.length,filesOnly?0:1);
  }
 }
 const db={select(){const q={from(){return q},leftJoin(){return q},where(){return q},orderBy(){return q},async execute(){return []}};return q}};
 assert.deepEqual(await run(mod.retrieve({db})(Nothing.value)(new Just('did:plc:test'))),{directory:{},parentDirectory:{},directories:[],files:[]});
}
console.log('Cloud listings: ownership, path normalization, ordering, dates, nullable tracks, parent fallback and provider-specific omissions passed');
