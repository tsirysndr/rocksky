import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {drizzle} from 'drizzle-orm/node-postgres';
import {PgDialect} from 'drizzle-orm/pg-core';
import {fromAff} from '../../output/Control.Promise/index.js';
import {Nothing} from '../../output/Data.Maybe/index.js';
import * as Algorithms from '../../output/Rocksky.Feeds.Algorithms/index.js';
import * as Query from '../../output/Rocksky.Feeds.Query/index.js';
import * as App from '../../output/Rocksky.Feeds.App/index.js';
import * as Auth from '../../output/Rocksky.Feeds.Auth/index.js';
import * as Env from '../../output/Rocksky.Feeds.Env/index.js';
import {toAffE} from '../../output/Control.Promise/index.js';
import {instrumentPool} from '../runtime/telemetry.js';
const run = aff => fromAff(aff)();
const algo = key => Algorithms.algorithms.find(algo => algo.rkey === key);
const feedUri = key => Algorithms.uri(algo(key));
const dialect = new PgDialect();
function harness(rows = [], failure = null) {
  const calls = [];
  const client = {query: async (config, values) => {
    calls.push({text:config.text, values});
    if (failure) throw failure;
    return {rows: config.rowMode === 'array' ? rows.map(row => [row.uri, row.timestamp]) : rows};
  }};
  const db = drizzle(client);
  const app = App.app({db, domain:'feeds.example.com', version:'test-commit', authenticate:Auth.optional}) ();
  return {app, calls, db};
}
const requestFeed = (app, key='all', params={}, headers={}) => app.request('/xrpc/app.rocksky.feed.getFeedSkeleton?'+new URLSearchParams({feed:feedUri(key),...params}), {headers});

test('all 52 algorithm definitions match the original source and ordering', () => {
  const mod = readFileSync(new URL('../../../apps/feeds/src/algos/mod.ts',import.meta.url),'utf8');
  const files = [...mod.matchAll(/import \* as \w+ from "\.\/([^"]+)";/g)].map(m => m[1]);
  const expected = files.map(file => {
    const source = readFileSync(new URL('../../../apps/feeds/src/algos/'+file, import.meta.url),'utf8');
    return {rkey:source.match(/export const rkey = "([^"]+)"/)[1], genre:source.match(/genreAlgorithm\("([^"]+)"/)?.[1] ?? null};
  });
  assert.equal(expected.length,52);
  assert.deepEqual(Algorithms.algorithms.map(a=>({rkey:a.rkey,genre:a.genre.value0??null})),expected);
  assert.ok(Algorithms.algorithms.every(a=>!a.needsAuth));
});

test('root, health, DID document and feed discovery do not query the database', async () => {
  const {app,calls}=harness();
  assert.match(await (await app.request('/')).text(), /Feed Generation service/);
  assert.deepEqual(await (await app.request('/xrpc/_health')).json(),{version:'test-commit'});
  const did=await (await app.request('/.well-known/did.json')).json();
  assert.equal(did.id,'did:web:feeds.example.com');
  assert.deepEqual(did.service,[{id:'#rocksky_fg',type:'RockskyFeedGenerator',serviceEndpoint:'https://feeds.example.com'}]);
  const description=await (await app.request('/xrpc/app.rocksky.feed.describeFeedGenerator')).json();
  assert.equal(description.did,did.id);
  assert.deepEqual(description.feeds,Algorithms.algorithms.map(a=>({uri:Algorithms.uri(a)})));
  assert.equal(calls.length,0);
});

test('all feed uses Drizzle projection and timestamp cursor with a default page size', async () => {
  const {app,calls}=harness([{uri:'at://did:plc:test/app.rocksky.scrobble/a',timestamp:'2026-01-01 00:00:00'}]);
  const result=await requestFeed(app);
  assert.equal(result.status,200);
  assert.deepEqual(await result.json(),{feed:[{scrobble:'at://did:plc:test/app.rocksky.scrobble/a'}],cursor:'1767225600000'});
  assert.match(calls[0].text,/select "uri", "timestamp" from "scrobbles"/);
  assert.match(calls[0].text,/order by "scrobbles"\."timestamp" desc limit \$1/);
  assert.deepEqual(calls[0].values,[50]);
});

test('all-feed cursor is an exclusive timestamp bound and offset remains ignored', async () => {
  const {app,calls}=harness();
  assert.equal((await requestFeed(app,'all',{cursor:'1767225600000suffix',limit:'7',offset:'100'})).status,200);
  assert.match(calls[0].text,/"timestamp" < \$1/);
  assert.deepEqual(calls[0].values,['2026-01-01T00:00:00.000Z',7]);
  assert.doesNotMatch(calls[0].text,/offset/i);
});

test('genre query uses shared Drizzle tables and bounded LATERAL SQL', () => {
  const q=dialect.sqlToQuery(Query.genreQuery("r&b' OR true --")({limit:3,cursor:'1700000000000'}));
  assert.match(q.sql,/from "artists" artist cross join lateral/);
  assert.match(q.sql,/from "scrobbles" recent/);
  assert.match(q.sql,/recent.uri is not null/);
  assert.match(q.sql,/recent.timestamp < to_timestamp\(\$1/);
  assert.equal((q.sql.match(/limit /g)||[]).length,2);
  assert.doesNotMatch(q.sql,/OR true/);
  assert.deepEqual(q.params,[1700000000000,3,"r&b' OR true --",3]);
});

test('genre endpoint returns scrobble URIs and truncates millisecond cursors', async () => {
  const {app,calls}=harness([{uri:'at://example/scrobble/1',timestampMs:1700000000000.9}]);
  const result=await requestFeed(app,'rnb',{limit:'2'});
  assert.equal(result.status,200);
  assert.deepEqual(await result.json(),{feed:[{scrobble:'at://example/scrobble/1'}],cursor:'1700000000000'});
  assert.deepEqual(calls[0].values,[2,'r&b',2]);
});

test('empty pages omit the cursor for all and genre feeds', async () => {
  const {app}=harness();
  for(const key of ['all','rock']) assert.deepEqual(await (await requestFeed(app,key)).json(),{feed:[]});
});

test('invalid cursors preserve source behavior: all fails, genre ignores', async () => {
  const {app,calls}=harness();
  assert.equal((await requestFeed(app,'all',{cursor:'garbage'})).status,500);
  assert.equal(calls.length,0);
  assert.equal((await requestFeed(app,'rock',{cursor:'garbage'})).status,200);
  assert.deepEqual(calls[0].values,[50,'rock',50]);
});

test('unsupported algorithm, publisher and collection return named XRPC errors', async () => {
  const {app,calls}=harness();
  for(const feed of [feedUri('all').replace('/all','/missing'),feedUri('all').replace(Algorithms.publisherDid,'did:plc:other'),feedUri('all').replace(Algorithms.collection,'app.bsky.feed.generator')]) {
    const response=await requestFeed(app,'all',{feed});
    assert.equal(response.status,400);
    assert.equal((await response.json()).error,'UnsupportedAlgorithm');
  }
  assert.equal(calls.length,0);
});

test('request parameter validation rejects malformed URIs, limits and offsets', async () => {
  const {app,calls}=harness();
  for(const params of [{feed:''},{feed:'foo'},{feed:'https://example.com'},{limit:'0'},{limit:'-1'},{limit:'1.5'},{limit:'abc'},{offset:'-1'},{offset:'1x'}]) {
    const response=await requestFeed(app,'all',params);
    assert.equal(response.status,400,JSON.stringify(params));
    assert.equal((await response.json()).error,'InvalidRequest');
  }
  assert.equal((await app.request('/xrpc/app.rocksky.feed.getFeedSkeleton')).status,400);
  assert.equal(calls.length,0);
});

test('optional authentication verifies Bearer tokens and degrades invalid tokens to anonymous', async () => {
  const seen=[];
  const verifier=token=>toAffE(async()=>{seen.push(token);if(token==='bad')throw new Error('invalid');return 'did:plc:person';});
  for(const header of ['', 'Basic abc']) assert.ok(await run(Auth.optionalWith(verifier)(header)) instanceof Nothing);
  assert.equal((await run(Auth.optionalWith(verifier)('Bearer   valid  '))).value0,'did:plc:person');
  assert.ok(await run(Auth.optionalWith(verifier)('Bearer bad')) instanceof Nothing);
  assert.deepEqual(seen,['valid','bad']);
  const {app}=harness();
  assert.equal((await requestFeed(app,'all',{}, {authorization:'Bearer invalid'})).status,200);
});

test('database failures produce sanitized XRPC errors', async () => {
  const {app}=harness([],new Error('private database details'));
  for(const key of ['all','rock']) {
    const response=await requestFeed(app,key);
    assert.equal(response.status,500);
    assert.deepEqual(await response.json(),{error:'InternalServerError',message:'Internal Server Error'});
  }
});

test('replica URL is preferred, with primary fallback', () => {
  assert.equal(Env.databaseUrl({XATA_READ_POSTGRES_URL:'replica',XATA_POSTGRES_URL:'primary'}),'replica');
  assert.equal(Env.databaseUrl({XATA_READ_POSTGRES_URL:'',XATA_POSTGRES_URL:'primary'}),'primary');
});

test('Postgres telemetry preserves promise, rejection, sync error and callback query behavior', async () => {
  let calls=0;
  const pool=instrumentPool({query(...args){calls++;if(typeof args.at(-1)==='function'){args.at(-1)(null,'callback');return undefined;}if(args[0]==='sync')throw new Error('sync');if(args[0]==='reject')return Promise.reject(new Error('reject'));return Promise.resolve('ok');}});
  assert.equal(await pool.query({text:'select $1'},['private-value']),'ok');
  await assert.rejects(()=>pool.query('reject'),/reject/);
  assert.throws(()=>pool.query('sync'),/sync/);
  let result;assert.equal(pool.query('select',(_err,value)=>result=value),undefined);assert.equal(result,'callback');
  assert.equal(calls,4);
});

test('real PostgreSQL executes both Drizzle query paths with exclusive pagination', {skip:!process.env.TEST_FEEDS_DATABASE_URL}, async () => {
  const {Client}=await import('pg');
  const client=new Client({connectionString:process.env.TEST_FEEDS_DATABASE_URL});
  await client.connect();
  try {
    await client.query("set timezone='UTC'");
    await client.query('create temporary table artists (xata_id text primary key, genres text[])');
    await client.query('create temporary table scrobbles (artist_id text, uri text, timestamp timestamp)');
    await client.query("insert into artists values ('one',array['rock','r&b']),('two',array['rock']),('other',array['jazz'])");
    await client.query("insert into scrobbles values ('one','first','2026-01-03'),('two','second','2026-01-02'),('one','third','2026-01-01'),('other','jazz','2026-01-04'),('one',null,'2026-01-05')");
    const db=drizzle(client);
    const first=await run(Query.run(db)(algo('rock'))({limit:2,cursor:''}));
    assert.deepEqual(first,{feed:[{scrobble:'first'},{scrobble:'second'}],cursor:'1767312000000'});
    const second=await run(Query.run(db)(algo('rock'))({limit:2,cursor:first.cursor}));
    assert.deepEqual(second,{feed:[{scrobble:'third'}],cursor:'1767225600000'});
    assert.deepEqual(await run(Query.run(db)(algo('rock'))({limit:2,cursor:second.cursor})),{feed:[]});
    const all=await run(Query.run(db)(algo('all'))({limit:2,cursor:''}));
    // Preserve the source: only genre feeds filter null record URIs.
    assert.deepEqual(all,{feed:[{scrobble:null},{scrobble:'jazz'}],cursor:'1767484800000'});
    assert.deepEqual(await run(Query.run(db)(algo('all'))({limit:1,cursor:all.cursor})),{feed:[{scrobble:'first'}],cursor:'1767398400000'});
  } finally { await client.end(); }
});
