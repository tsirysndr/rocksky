import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PgDialect} from 'drizzle-orm/pg-core';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='record-dedup-test';
const D=await import('../output/Rocksky.Scripts.DedupRecords/index.js');const {fromAff,toAffE}=await import('../output/Control.Promise/index.js');const {Nothing}=await import('../output/Data.Maybe/index.js');const run=a=>fromAff(a)();const aff=f=>toAffE(()=>Promise.resolve().then(f));const dialect=new PgDialect();
assert.equal(D.identityKey('artist')({name:'  ARTIST  '}).value0,'  artist  ');assert.equal(D.identityKey('album')({title:'ALBUM',artist:'ARTIST'}).value0,'album - artist');assert.equal(D.identityKey('song')({title:'Song',artist:'Artist',album:''}),Nothing.value);assert.equal(D.parseOptions(['did:test','--only','bogus']),Nothing.value);assert.deepEqual(D.parseOptions(['--only','song,artist','did:test','--dry-run']).value0,{target:'did:test',dryRun:true,collections:['song','artist']});
function fixture(dryRun){const events=[],queries=[],listCalls=[];const make=(key,createdAt)=>({uri:'at://did/app.rocksky.artist/'+key,value:{$type:'app.rocksky.artist',name:'Artist',createdAt}});const records=Array.from({length:103},(_,i)=>make(String(i).padStart(3,'0'),'2020-01-01'));records.push({uri:'invalid',value:{name:''}});const batches=[{records:records.slice(0,100),cursor:'next'},{records:records.slice(100),cursor:null}];const keeper=records[102].uri;const agent={assertDid:'did',com:{atproto:{repo:{async listRecords(p){listCalls.push(p);return {data:batches.shift()}},async applyWrites(p){events.push({kind:'delete',...p});return {data:{}}}}}}};const db={select(){const q={from(){return q},innerJoin(){return q},where(){return q},async execute(){return [{uri:keeper}]}};return q},async execute(q){const sql=dialect.sqlToQuery(q);queries.push(sql);events.push({kind:'repoint',sql});if(queries.length===2)throw new Error('one reference failed');return {rowCount:2}}};return {agent,db,events,queries,listCalls,keeper,dryRun};}
{
 const m=fixture(false);await run(D.deduplicate({db:m.db})(m.agent)('did')(false)(['artist'])(aff(()=>m.events.push({kind:'pause'}))));assert.deepEqual(m.events.map(e=>e.kind),['delete','pause','delete','pause','repoint','repoint','repoint','repoint']);const deletes=m.events.filter(e=>e.kind==='delete');assert.deepEqual(deletes.map(e=>e.writes.length),[100,2]);assert.ok(deletes.flatMap(e=>e.writes).every(w=>w.rkey!=='102'));assert.equal(m.listCalls[1].cursor,'next');assert.equal(m.queries.length,4,'individual failure must not skip later references');for(const q of m.queries)assert.equal(q.params[0],m.keeper);assert.match(m.queries[2].sql,/UPDATE "tracks" SET "artist_uri"/);
}
{
 const m=fixture(true);await run(D.deduplicate({db:m.db})(m.agent)('did')(true)(['artist'])(aff(()=>{throw new Error('dry run waited')})));assert.deepEqual(m.events,[]);assert.equal(m.listCalls.length,2);
}
{
 const queries=[];await run(D.repoint({db:{async execute(q){queries.push(dialect.sqlToQuery(q));return {rowCount:0}}}})('album')('keeper')(['gone']));assert.equal(queries.length,3);assert.match(queries[2].sql,/SET "album_uri"/);
}
console.log('Record dedup: identity validation, CLI collections, linked keeper priority, pagination, 100-write batches, pacing, delete-before-repoint, per-reference recovery and dry-run passed');

const Set=await import('../output/Data.Set/index.js');
const records=[{uri:'z',rkey:'z',createdAt:'2021',key:'same'},{uri:'b',rkey:'b',createdAt:'2020',key:'same'},{uri:'a',rkey:'a',createdAt:'2020',key:'same'}];
assert.equal(D.plan(records)(Set.empty)[0].keeper.uri,'a');
assert.deepEqual(D.plan(records)(Set.empty)[0].gone.map(r=>r.uri),['z','b']);
