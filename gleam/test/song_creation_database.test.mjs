import assert from 'node:assert/strict';
import {test} from 'node:test';
import pg from 'pg';
import {createHash} from 'node:crypto';
import {createTables} from './helpers/postgres.mjs';
import {Ok} from '../build/dev/javascript/rocksky_api/gleam.mjs';
import {create} from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/song/create_song.mjs';
import {parse} from '../build/dev/javascript/rocksky_api/rocksky_api/lib/track.mjs';
import {encode_song_view_detailed} from '../build/dev/javascript/rocksky_api/rocksky_api/lexicon/models.mjs';
import {describe} from '../build/dev/javascript/rocksky_api/rocksky_api/error.mjs';
const hash=s=>createHash('sha256').update(s.toLowerCase()).digest('hex');
test('Song creation publishes new catalog records, waits for indexing, heals links and reuses identity',{skip:!process.env.GLEAM_TEST_PGHOST},async()=>{
 const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
 try{
 await createTables(pool,['tracks','albums','artists','album_tracks','artist_tracks','artist_albums']);
 const did='did:plc:abcdefghijklmnopqrstuvwx',writes=[],messages=[];
 const agent={did,com:{atproto:{repo:{putRecord:async p=>{
 const uri=`at://${did}/${p.collection}/${p.rkey}`;writes.push(p);const r=p.record;
 if(p.collection==='app.rocksky.song')await pool.query('INSERT INTO tracks(xata_id,title,artist,album_artist,album,duration,sha256,uri) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',['t',r.title,r.artist,r.albumArtist,r.album,r.duration,hash(`${r.title} - ${r.artist} - ${r.album}`),uri]);
 if(p.collection==='app.rocksky.artist')await pool.query('INSERT INTO artists(xata_id,name,sha256,uri) VALUES ($1,$2,$3,$4)',['a',r.name,hash(r.name),uri]);
 if(p.collection==='app.rocksky.album')await pool.query('INSERT INTO albums(xata_id,title,artist,sha256,uri) VALUES ($1,$2,$3,$4,$5)',['al',r.title,r.artist,hash(`${r.title} - ${r.artist}`),uri]);
 return {data:{uri,cid:'cid'}};
 }}}}};
 const ctx={db:{pool},nc:{publish:(subject,data)=>messages.push({subject,data:JSON.parse(Buffer.from(data).toString())})}};
 const input=parse({title:'New Song',artist:'Artist',albumArtist:'Artist',album:'Album',duration:1000,trackNumber:2.5,discNumber:0})[0];assert.equal(input.track_number[0],1);
 let result=await create(ctx,input,agent);assert.ok(result instanceof Ok,result instanceof Ok?'':describe(result[0]));let view=encode_song_view_detailed(result[0]);assert.equal(writes.length,3);assert.equal(new Set(writes.map(w=>w.rkey)).size,3);assert.equal(view.title,'New Song');assert.ok(view.albumUri);assert.ok(view.artistUri);assert.equal(writes[0].record.trackNumber,1);assert.equal(writes[0].record.discNumber,1);assert.equal(messages.at(-1).subject,'rocksky.track');assert.equal(messages.at(-1).data.album_track.track_id.xata_id,'t');
 result=await create(ctx,input,agent);assert.ok(result instanceof Ok);assert.equal(writes.length,3);assert.equal((await pool.query('SELECT count(*) FROM album_tracks')).rows[0].count,1);
 }finally{await pool.end();}
});
