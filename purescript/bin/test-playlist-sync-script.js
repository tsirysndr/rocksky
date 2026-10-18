import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {getTableName} from 'drizzle-orm';
import {PgDialect} from 'drizzle-orm/pg-core';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='playlist-sync-test';
const {ordString}=await import('../output/Data.Ord/index.js');
const P=await import('../output/Rocksky.Scripts.SyncLibraryPlaylist/index.js');const S=await import('../output/Data.Set/index.js');const {fromAff,toAffE}=await import('../output/Control.Promise/index.js');const run=a=>fromAff(a)();const aff=f=>toAffE(()=>Promise.resolve().then(f));const dialect=new PgDialect();
const playlistUri='at://did:plc:test/app.rocksky.playlist/p';
{
 const calls=[],batches=[{records:[{value:{playlist:{uri:playlistUri},song:{uri:'one'}}},{value:{playlist:{uri:'other'},song:{uri:'skip'}}}],cursor:'next'},{records:[{value:{playlist:{uri:playlistUri},song:{uri:'two'}}},{value:{playlist:{uri:playlistUri},song:{uri:'one'}}},{value:{playlist:{uri:playlistUri},song:{uri:''}}}],cursor:null}];
 const agent={com:{atproto:{repo:{async listRecords(p){calls.push(p);return {data:batches.shift()}}}}}};const set=await run(P.readPublished(agent)(playlistUri));assert.equal(S.size(set),2);assert.equal(S.member(ordString)('one')(set),true);assert.equal(S.member(ordString)('skip')(set),false);assert.equal(calls[1].cursor,'next');assert.equal(calls[0].collection,'app.rocksky.playlist.song');
}
function db(){const queries=[];const rows={users:[{id:'user',handle:'owner'}],navidrome_playlists:[{id:'p',name:'Playlist',uri:playlistUri}],navidrome_playlist_tracks:[{id:'1',title:'Missing',uri:null},{id:'2',title:'Existing',uri:'already'},{id:'3',title:'Bad',uri:'bad'},{id:'4',title:'New',uri:'new'},{id:'5',title:'New repeated',uri:'new'}]};return {queries,rows,db:{select(){let table;const q={from(t){table=getTableName(t);return q},innerJoin(){return q},where(c){queries.push({table,...dialect.sqlToQuery(c)});return q},limit(){return q},orderBy(c){assert.match(dialect.sqlToQuery(c).sql,/xata_createdat.*asc/);return q},async execute(){return rows[table]}};return q}}};}
{
 const m=db(),calls=[];const ops={agent:aff(()=>{calls.push('agent');return {}}),ensure:a=>aff(()=>{calls.push('ensure');return {uri:playlistUri,published:false}}),published:uri=>aff(()=>{calls.push('published');return S.insert(ordString)('already')(S.empty)}),add:a=>uri=>song=>aff(()=>{calls.push(song);if(song==='bad')throw new Error('bad song')})};
 await run(P.synchronizeWith({db:m.db})('did:plc:test')('p')(false)(ops));assert.deepEqual(calls,['agent','ensure','published','bad','new','new']);assert.deepEqual(m.queries.find(q=>q.table==='navidrome_playlists').params,['p','user']);
 calls.length=0;await run(P.synchronizeWith({db:m.db})('did:plc:test')('p')(true)(ops));assert.deepEqual(calls,[],'dry run must not restore agent or read/write PDS');
 m.rows.navidrome_playlists=[];await assert.rejects(run(P.synchronizeWith({db:m.db})('did:plc:test')('p')(false)(ops)),/not found for owner/);assert.deepEqual(calls,[]);
}
console.log('Playlist sync: public-repo pagination, playlist-scoped entries, owner SQL, dry-run before auth, existing song exclusion, duplicate preservation and per-song recovery passed');
