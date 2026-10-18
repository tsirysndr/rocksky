import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PgDialect} from 'drizzle-orm/pg-core';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='riff-test';
const B=await import('../output/Rocksky.Scripts.BackfillRiff/index.js');const {fromAff,toAffE}=await import('../output/Control.Promise/index.js');const {Just,Nothing}=await import('../output/Data.Maybe/index.js');const Ref=await import('../output/Effect.Ref/index.js');
const run=a=>fromAff(a)();const aff=f=>toAffE(()=>Promise.resolve().then(f));const fresh=()=>Ref.new({...B.emptyStats})();const opts={pageSize:3,concurrency:2,limit:Infinity,only:'all',dryRun:false,quiet:true};const just=x=>new Just(x);const none=Nothing.value;
assert.deepEqual(B.titleVariants('Song - Remastered 2011'),['Song - Remastered 2011','Song']);assert.deepEqual(B.titleVariants('Song (feat. Artist)'),['Song (feat. Artist)','Song']);assert.deepEqual(B.titleVariants('Song - From "Movie"'),['Song - From "Movie"','Song']);assert.deepEqual(B.titleVariants('  A  Song  '),['  A  Song  ','A Song']);assert.equal(B.primaryArtist('A feat. B & C'),'A');assert.equal(B.spotifyId('album')('https://open.spotify.com/album/Ab12?q=x').value0,'Ab12');assert.ok(B.bestImage([{url:'https://cdn.bsky.app/x'},{url:'https://spotify/okay'}]) instanceof Nothing);
const row={id:'a',title:'Song',artist:'A',album:'Album',duration:0,albumArt:'https://cdn.rocksky.app/art',trackNumber:null,discNumber:null,isrc:null,spotifyLink:null};const hit={duration_ms:123,album:{images:[{url:'https://spotify/art'}]},track_number:2,disc_number:1,external_ids:{isrc:'isrc'},external_urls:{spotify:'https://spotify/link'}};
assert.deepEqual(B.patchFor('tracks')(row)(hit),{patch:{duration:123,albumArt:'https://spotify/art',trackNumber:2,discNumber:1,isrc:'isrc',spotifyLink:'https://spotify/link'},artReplaced:true});
assert.deepEqual(B.patchFor('tracks')({...row,duration:5,albumArt:'',trackNumber:0,discNumber:0,isrc:'',spotifyLink:''})(hit),{patch:{},artReplaced:false});
assert.deepEqual(B.patchFor('albums')({albumArt:null,releaseDate:null,year:null,spotifyLink:null})({images:[{url:'https://spotify/art'}],release_date:'202a',external_urls:{spotify:'url'}}).patch,{albumArt:'https://spotify/art',releaseDate:'202a',year:202,spotifyLink:'url'});
assert.deepEqual(B.patchFor('artists')({picture:null,genres:[],spotifyLink:null})({images:[{url:'https://spotify/art'}],genres:['rock'],external_urls:{spotify:'url'}}).patch,{picture:'https://spotify/art',genres:['rock'],spotifyLink:'url'});
{
 const calls=[];await run(B.applyPatch({spotifyLink:'link',albumArt:'art'})(patch=>aff(()=>{calls.push(patch);if(calls.length===1)throw Object.assign(Error('wrapped'),{cause:Error('23505 duplicate')})})));assert.deepEqual(calls,[{spotifyLink:'link',albumArt:'art'},{albumArt:'art'}]);
 let count=0;await run(B.applyPatch({spotifyLink:'link'})(()=>aff(()=>{count++;throw Error('spotify_link duplicate')})));assert.equal(count,1);await assert.rejects(run(B.applyPatch({albumArt:'art'})(()=>aff(()=>{throw Error('other')}))),/other/);
}
{
 const paths=[],stats=fresh(),client={memo:Ref.new({})(),match:()=>aff(()=>just('track1')),request:path=>()=>aff(()=>{paths.push(path);if(path==='/tracks/track1')return just(hit);if(path.includes('Song%22'))return just({albums:{items:[{id:'album1'}]}});return none})};
 assert.equal((await run(B.findHit(client)(stats)('tracks')(row))).value0,hit);await run(B.findHit(client)(stats)('tracks')(row));assert.deepEqual(paths,['/tracks/track1']);
 const album={title:'Song - Remastered 2011',artist:'A, B',spotifyLink:'https://open.spotify.com/album/missing'};assert.equal((await run(B.findHit(client)(stats)('albums')(album))).value0.id,'album1');assert.deepEqual(paths.slice(1),['/albums/missing','/search?type=album&q=album%3A%22Song%20-%20Remastered%202011%22%20artist%3A%22A%22','/search?type=album&q=album%3A%22Song%22%20artist%3A%22A%22']);
 const before=paths.length;await run(B.findHit(client)(stats)('albums')(album));assert.equal(paths.length,before);
 let writes=0;assert.equal(await run(B.fill({...opts,dryRun:true})(client)(stats)('tracks')(()=>()=>aff(()=>{writes++}))(row)),'updated');assert.equal(writes,0);assert.equal(Ref.read(stats)().artReplaced,1);
}
{
 const stats=fresh(),cursors=[],seen=[];let active=0,max=0;const pages=[[{id:'a'},{id:'b'},{id:'c'}],[{id:'d'},{id:'e'}],[]];
 await run(B.walk({...opts,limit:4})(stats)('tracks')(cursor=>aff(()=>{cursors.push(cursor);return pages.shift()}))(row=>aff(async()=>{seen.push(row.id);active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,2));active--;if(row.id==='b')throw Error('bad row');return row.id==='c'?'clean':row.id==='d'?'missed':'updated'})));
 assert.deepEqual(cursors,['','c']);assert.deepEqual(seen,['a','b','c','d']);assert.equal(max,2);assert.deepEqual(Ref.read(stats)(),{scanned:4,updated:1,missed:1,clean:1,artReplaced:0,errors:1});
}
{
 const dialect=new PgDialect(),queries=[];const db={select(){const q={from(){return q},where(w){queries.push(dialect.sqlToQuery(w));return q},orderBy(){return q},limit(n){assert.equal(n,3);return q},async execute(){return []}};return q}};
 for(const kind of ['tracks','albums','artists'])await run(B.fetchPage({db})(opts)(kind)('cursor'));
 assert.deepEqual(queries[0].params,['cursor',0,'https://cdn.rocksky.app%','https://cdn.bsky.app%']);assert.deepEqual(queries[1].params,['cursor','https://cdn.rocksky.app%','https://cdn.bsky.app%']);assert.deepEqual(queries[2].params,['cursor']);assert.match(queries[2].sql,/picture.*is null/);
}
const fetchOriginal=globalThis.fetch;
try{
 const stats=fresh();globalThis.fetch=async(_url,options)=>{assert.ok(options.signal);return new Response(null,{status:404})};assert.ok(await run(B.request('https://riff')('/track')(stats)) instanceof Nothing);assert.equal(Ref.read(stats)().errors,0);
 globalThis.fetch=async()=>{throw Error('network')};assert.ok(await run(B.request('https://riff')('/track')(stats)) instanceof Nothing);assert.equal(Ref.read(stats)().errors,1);
 globalThis.fetch=async()=>new Response('not json');await run(B.request('https://riff')('/track')(stats));assert.equal(Ref.read(stats)().errors,2);
}finally{globalThis.fetch=fetchOriginal}
console.log('Riff backfill: title ladder, memoized misses, matching, sparse patches, unique-link retry, dry run, keyset workers and HTTP errors passed');
