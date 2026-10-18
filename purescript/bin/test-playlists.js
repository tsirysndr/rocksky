import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {drizzle} from 'drizzle-orm/node-postgres';
import {PgDialect} from 'drizzle-orm/pg-core';
import {getTableName} from 'drizzle-orm';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');
process.env.NODE_ENV='test';for(const [,k] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[k]='playlist-test';
const List=await import('../output/Rocksky.Xrpc.App.Rocksky.Playlist.GetPlaylists/index.js');
const Detail=await import('../output/Rocksky.Xrpc.App.Rocksky.Playlist.GetPlaylist/index.js');
const {fromAff}=await import('../output/Control.Promise/index.js');
const {Just,Nothing}=await import('../output/Data.Maybe/index.js');
const run=aff=>fromAff(aff)();const dialect=new PgDialect();
{
 const statements=[];const db=drizzle({async query(config,params){statements.push({sql:config.text,params});return {rows:[]}}});
 await run(List.retrievePlaylists(db)({filter:'track.artist=="Daft Punk";track.album==Discovery',limit:5,offset:2}));
 const q=statements[0];assert.match(q.sql,/select distinct/);assert.match(q.sql,/exists \(select 1/);assert.match(q.sql,/"playlist_tracks"\."playlist_id" = "playlists"\."xata_id"/);
 assert.match(q.sql,/"tracks"\."artist" = \$1 and "tracks"\."album" = \$2/);assert.deepEqual(q.params,['Daft Punk','Discovery',5,2]);
 assert.match(q.sql,/GROUP BY t.album_art ORDER BY MIN\(pt.xata_createdat\) LIMIT 4/);
 await run(List.retrievePlaylists(db)({filter:'curatorDid==did:plc:u;title==Mix',limit:0}));
 assert.doesNotMatch(statements[1].sql,/select distinct|exists/);assert.deepEqual(statements[1].params,['did:plc:u','Mix',20]);
 await assert.rejects(run(List.retrievePlaylists(db)({filter:'unsupported==x'})),e=>e.customErrorName==='InvalidFilter');
 assert.equal(statements.length,2);
}
const now=new Date('2026-01-01T00:00:00Z');const playlist={id:'p',name:'Mix',picture:null,description:'desc',createdAt:now,updatedAt:now};
const user={did:'did:plc:u',displayName:'User',handle:'user.test',avatar:null};
{
 const result=List.presentation({playlists:playlist,users:user,trackCount:'3',trackArts:null})();
 assert.equal(result.title,'Mix');assert.equal(result.name,undefined);assert.equal(result.picture,undefined);assert.equal(result.curatorDId,user.did);assert.equal(result.trackCount,'3');assert.deepEqual(result.trackArts,[]);assert.equal(result.createdAt,now.toISOString());
}
function mock(responses){const queries=[];return {db:{select(){let table;const q={from(t){table=getTableName(t);return q},leftJoin(){return q},innerJoin(){return q},where(c){queries.push(['where',dialect.sqlToQuery(c)]);return q},limit(){return q},orderBy(...items){queries.push(['order',items.map(c=>dialect.sqlToQuery(c).sql)]);return q},async execute(){assert.ok(responses[table]?.length,'unexpected read: '+table);return responses[table].shift()}};return q}},queries};}
{
 const m=mock({users:[[{did:user.did}],[]]});
 assert.equal(await run(Detail.canonicalUri(m.db)('at://user.test/app.rocksky.playlist/r')),'at://did:plc:u/app.rocksky.playlist/r');
 assert.equal(await run(Detail.canonicalUri(m.db)('at://unknown.test/app.rocksky.playlist/r')),'at://unknown.test/app.rocksky.playlist/r');
 assert.equal(await run(Detail.canonicalUri(m.db)('at://did:plc:u/app.rocksky.playlist/r')),'at://did:plc:u/app.rocksky.playlist/r');
 assert.equal(await run(Detail.canonicalUri(m.db)('at://user.test/no-key')),'at://user.test/no-key');assert.equal(m.queries.length,2);
}
{
 const track={id:'t',title:'Song',lyrics:'omit',sha256:'hash',createdAt:now,updatedAt:now};
 const m=mock({user_playlists:[[{playlists:playlist,users:user,trackCount:5}]],playlist_tracks:[[{tracks:track}]],tracks:[[{id:'t',sha256:'hash'}]],loved_tracks:[[{sha256:'hash',did:user.did},{sha256:'hash',did:'did:plc:v'}]]});
 const result=await run(Detail.retrieveWithDb({db:m.db})({uri:'at://did:plc:u/app.rocksky.playlist/r',filter:'duration=ge=30000'})(new Just(user.did)));
 assert.equal(result.trackCount,5);assert.equal(result.tracks.length,1);assert.equal(result.tracks[0].likesCount,2);assert.equal(result.tracks[0].liked,true);assert.equal(result.tracks[0].lyrics,undefined);assert.equal(result.tracks[0].createdAt,now.toISOString());
 assert.equal(result.name,undefined);assert.deepEqual(m.queries.find(q=>q[0]==='order')[1],['"playlist_tracks"."added_at" asc','"playlist_tracks"."xata_createdat" asc']);
 assert.ok(m.queries.some(q=>q[0]==='where'&&q[1].params.includes(30000)));
}
{
 const m=mock({user_playlists:[[]],playlist_tracks:[[]]});await assert.rejects(run(Detail.retrieveWithDb({db:m.db})({uri:'at://did:plc:u/c/r'})(Nothing.value)),/Playlist not found/);
}
console.log('Playlist SQL semijoin/filter validation, URI canonicalization, presentation, ordering and per-track likes checks passed');
