import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { encode } from '@atproto/lex-cbor';
import { jsonToLex } from '@atproto/lex';
import { job } from '../output/Rocksky.Jetstream.Backfill/index.js';
import { normalize, next, capture, open, close } from '../output/Rocksky.Jetstream.Backfill/foreign.js';
const hash = value => createHash('sha256').update(value).digest('hex');
const did = 'did:plc:abcdefghijklmnopqrstuvwx';
const cid = 'bafyreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku';
const event = (seq = 12, operation = 'create', collection = 'app.rocksky.song') => ({
  seq, did, time: '2026-10-18T12:00:00.123456Z', kind: 'commit',
  commit: { rev: `3my55gcmfos${seq}`, operation, collection, rkey: 'record', cid,
    record: { $type: collection, title: 'Song', image: { $link: cid } } },
});
const opts = { service: 'https://jetstream.example', apiKey: '', database: '', afterSeq: null,
  beforeSeq: null, batchSize: 2, limit: null, dryRun: false, help: false };

test('CBOR records preserve wire CID markers and Rust inbox identity for all operations', () => {
  for (const operation of ['create', 'update', 'delete']) {
    const raw = event(12, operation);
    const expected = raw.commit.record;
    raw.commit.record = encode(jsonToLex(expected));
    const normalized = normalize(raw);
    assert.equal(normalized.timeUs, 1792324800123456);
    assert.deepEqual(normalized.record, operation === 'delete' ? null : expected);
    const queued = job(normalized);
    const key = `${did}|app.rocksky.song|record|${raw.commit.rev}`;
    assert.equal(queued.id, hash(JSON.stringify(['jetstream.commit.v1', key])));
    assert.equal(queued.requestHash, hash(queued.payload));
    assert.equal(JSON.parse(queued.payload).commit.operation, operation);
    assert.equal(JSON.parse(queued.payload).time_us, normalized.timeUs);
  }
  assert.equal(normalize(event(13, 'create', 'app.rocksky.future.collection')).collection, 'app.rocksky.future.collection');
  assert.throws(() => normalize(event(1e15)), /sequence/);
  assert.throws(() => normalize(event(1, 'create', 'app.bsky.feed.post')), /filter/);
});

test('bounded pulls stop at EOF and reject out-of-order or malformed events', async () => {
  const session = events => ({ controller: new AbortController(), lastSeq: 0,
    iterator: (async function* () { yield* events; })() });
  const good = session([event(1), event(2), event(3)]);
  assert.equal((await next(good)(2)()).length, 2);
  assert.equal((await next(good)(2)()).length, 1);
  assert.deepEqual(await next(good)(2)(), []);
  await assert.rejects(next(session([event(2), event(1)]))(2)(), /increasing/);
  await assert.rejects(next(session([{...event(), time:'bad'}]))(2)(), /time/);
  const aborted = session([event()]); aborted.controller.abort();
  await assert.rejects(next(aborted)(2)());
});

test('CLI help needs no application secrets and rejects timestamp cursors', () => {
  const run = args => spawnSync(process.execPath, ['bin/run.js', 'Rocksky.Scripts.BackfillJetstream', ...args], {encoding:'utf8'});
  const help = run(['--help']); assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /app\.rocksky|archive/);
  assert.notEqual(run(['--dry-run', '--after-seq', '1792324800123456']).status, 0);
  assert.notEqual(run(['--dry-run', '--batch-size', '0']).status, 0);
  assert.notEqual(run(['--dry-run', '--unknown']).status, 0);
});

test('SDK snapshot requests the namespace filter and stops at the archive tip without a live tail', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  let session;
  try {
    globalThis.fetch = async (input, init) => {
      const req = new Request(input, init);
      assert.equal(new URL(req.url).pathname, '/xrpc/network.bsky.jetstream.planSnapshot');
      const body = await req.json(); requests.push(body);
      assert.deepEqual(body.collections, ['app.rocksky.*']);
      assert.deepEqual(body.kinds, ['commit']);
      return Response.json({sealedTipSeq:100, plannedThroughSeq:100, segments:[],
        stats:{segmentsExamined:1,segmentsMatched:0,blocksMatched:0,entries:0}});
    };
    session = await open({...opts, dryRun:true})();
    assert.equal(session.pool, null);
    assert.deepEqual(await next(session)(250)(), []);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].afterSeq, 0);
  } finally {
    if (session) await close(session)();
    globalThis.fetch = originalFetch;
  }
});

test('Postgres batches are atomic, deduplicated, resumable, and isolated from the live cursor',
  {skip: !process.env.JETSTREAM_BACKFILL_TEST_URL}, async () => {
    const url = new URL(process.env.JETSTREAM_BACKFILL_TEST_URL);
    assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
    const schema = 'backfill_test_' + randomBytes(6).toString('hex');
    const client = new pg.Client({connectionString:url.href});
    let resumed;
    await client.connect();
    try {
      await client.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}`);
      await client.query(readFileSync(new URL('../../crates/submissions/src/schema.sql', import.meta.url),'utf8'));
      await client.query("ALTER TABLE rocksky_durable_jobs ADD COLUMN actor TEXT NOT NULL DEFAULT ''");
      const source = `jetstream:v2:backfill:${opts.service}:app.rocksky.*`;
      const live = 'jetstream:v2:wss://jetstream.example';
      await client.query('INSERT INTO rocksky_durable_cursors VALUES ($1, 9999)',[live]);
      const s = {client, source};
      const jobs = [job(normalize(event(1))), job(normalize(event(2)))];
      assert.equal(await capture(s)(jobs)(2)(), 2);
      assert.equal(await capture(s)(jobs)(2)(), 0);
      await assert.rejects(capture(s)([{...job(normalize(event(3))), actor: null}])(3)());
      const {rows} = await client.query('SELECT source, cursor_value FROM rocksky_durable_cursors');
      assert.equal(rows.find(r=>r.source===source).cursor_value, '2');
      assert.equal(rows.find(r=>r.source===live).cursor_value, '9999');
      assert.equal((await client.query('SELECT count(*) FROM rocksky_durable_jobs')).rows[0].count, '2');
      // Loading a checkpoint does not contact the archive until the first pull.
      url.searchParams.set('options', `-c search_path=${schema}`);
      resumed = await open({...opts, database:url.href})();
      assert.equal(resumed.lastSeq, 2);
      await assert.rejects(open({...opts, database:url.href})(), /already running/);
      await close(resumed)(); resumed = null;
      await assert.rejects(open({...opts, database:url.href, afterSeq:0})(), /conflicts/);
    } finally {
      if (resumed) await close(resumed)();
      await client.query(`DROP SCHEMA ${schema} CASCADE`);
      await client.end();
    }
  });
