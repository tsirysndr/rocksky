import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { encode } from '@atproto/lex-cbor';
import { drizzle } from 'drizzle-orm/node-postgres';
import { toList } from '../build/dev/javascript/rocksky_api/gleam.mjs';
import { job, replay, Options } from '../build/dev/javascript/rocksky_api/rocksky_api/scripts/backfill_jetstream_v2.mjs';
import { parseOptions, normalize, next, capture, close } from '../build/dev/javascript/rocksky_api/rocksky_api/scripts/backfill_jetstream_v2_ffi.mjs';

const event = (seq = 1, operation = 'create', collection = 'app.rocksky.scrobble') => ({
  seq, did: 'did:plc:test', time: '2026-10-18T01:02:03.123456Z', kind: 'commit',
  commit: { operation, collection, rkey: 'test', rev: `rev${seq}`, cid: 'bafyreitest',
    record: { $type: collection, title: 'Music', bytes: { $bytes: 'AQI=' } } },
});
const session = events => ({ controller: new AbortController(), lastSeq: 0,
  iterator: (async function* () { yield* events; })(), source: 'jetstream:backfill:v2:https://test:app.rocksky.*' });

test('options validate bounds and require explicit queue except for help/dry-run', () => {
  assert.equal(parseOptions(['--help'], {}).help, true);
  assert.equal(parseOptions(['--dry-run', '--limit', '3'], {}).limit, 3);
  assert.throws(() => parseOptions([], {}), /SUBMISSIONS_DATABASE_URL/);
  for (const args of [['--limit','0'], ['--batch-size','1001'], ['--after-seq','NaN'],
    ['--before-seq','3','--after-seq','4'], ['--service','wss://example.com'], ['--service','https://secret@example.com']]) {
    assert.throws(() => parseOptions(['--dry-run', ...args], {}));
  }
});

test('optional cursor aliases the exclusive starting sequence', () => {
  const parse = args => parseOptions(['--dry-run', ...args], {});
  assert.equal(parse([]).after, undefined);
  for (const n of ['0', '3000000000']) {
    assert.equal(parse(['--cursor', n]).after, Number(n));
    assert.equal(parse(['--after-seq', n]).after, Number(n));
  }
  for (const args of [['--cursor', '-1'], ['--cursor', 'NaN'], ['--cursor', '1.5'],
    ['--cursor', '9007199254740992'], ['--cursor', '3', '--before-seq', '3'],
    ['--cursor', '3', '--after-seq', '3']]) assert.throws(() => parse(args));
});

test('wire payload, microseconds and live dedup identity match Rust inbox', () => {
  const normalized = normalize(event());
  const payload = JSON.parse(normalized.payload);
  assert.equal(payload.time_us, Date.parse('2026-10-18T01:02:03.123Z') * 1000 + 456);
  assert.deepEqual(payload.commit.record.bytes, { $bytes: 'AQI' });
  const queued = job(normalized);
  assert.equal(queued.id, createHash('sha256').update(JSON.stringify([
    'jetstream.commit.v1', 'did:plc:test|app.rocksky.scrobble|test|rev1',
  ])).digest('hex'));
  assert.equal(queued.actor, 'did:plc:test');
  assert.equal(queued.request_hash, createHash('sha256').update(normalized.payload).digest('hex'));
  assert.equal(JSON.parse(normalize(event(2, 'delete')).payload).commit.record, null);
  assert.equal(normalize(event(3, 'update', 'app.rocksky.future.collection')).collection, 'app.rocksky.future.collection');
  assert.throws(() => normalize(event(4, 'create', 'app.bsky.feed.post')), /outside/);
  assert.throws(() => normalize({...event(), seq: Infinity}), /sequence/);
});

test('archive DAG-CBOR records retain byte values and reject malformed data', () => {
  const item = event();
  item.commit.record = encode({ $type: 'app.rocksky.scrobble', title: 'Music', bytes: new Uint8Array([1,2]) });
  assert.deepEqual(JSON.parse(normalize(item).payload).commit.record.bytes, { $bytes: 'AQI' });
  item.commit.record = new Uint8Array([255]);
  assert.throws(() => normalize(item));
});

test('bounded batches, monotonic sequences, cancellation and dry-run limit', async () => {
  const s = session([event(1), event(2), event(3)]);
  assert.equal((await next(s, 2)).toArray().length, 2);
  assert.equal((await next(s, 2)).toArray()[0].seq, 3);
  assert.equal((await next(s, 2)).toArray().length, 0);
  await assert.rejects(next(session([event(2),event(1)]), 2), /increase/);
  const aborted = session([event()]); aborted.controller.abort();
  await assert.rejects(next(aborted, 1));
  const limited = session([event(1), event(2), event(3)]);
  const outcome = await replay(limited, new Options(false, true, 250, 2), 0, 0);
  assert.equal(outcome.isOk(), true);
  assert.equal(limited.lastSeq, 2);
});

test('cleanup releases the dedicated database connection even when iterator return fails', async () => {
  const calls = [];
  const s = session([]);
  s.stop = () => {};
  s.iterator = { return: async () => { throw new Error('return failed'); } };
  s.client = { release: destroy => calls.push(['release', destroy]) };
  s.pool = { end: async () => calls.push(['end']) };
  await assert.rejects(close(s), /return failed/);
  assert.deepEqual(calls, [['release', true], ['end']]);
});

test('database capture deduplicates, isolates live cursor and rolls back failed checkpoint',
  { skip: !process.env.GLEAM_TEST_DATABASE_URL }, async () => {
    const client = new pg.Client({ connectionString: process.env.GLEAM_TEST_DATABASE_URL });
    await client.connect();
    try {
      // Session-local tables shadow real tables; no application data is touched.
      await client.query(`CREATE TEMP TABLE rocksky_durable_jobs (
        id text PRIMARY KEY, kind text NOT NULL, request_hash text NOT NULL, payload text NOT NULL,
        source text NOT NULL, collection text NOT NULL, actor text NOT NULL, status text NOT NULL,
        available_at bigint NOT NULL, created_at bigint NOT NULL, updated_at bigint NOT NULL);
        CREATE TEMP TABLE rocksky_durable_cursors (source text PRIMARY KEY, cursor_value bigint NOT NULL CHECK(cursor_value < 100));
        INSERT INTO rocksky_durable_cursors VALUES ('jetstream:v2:live', 99)`);
      const s = { ...session([]), db: drizzle(client) };
      const batch = toList([job(normalize(event()))]);
      assert.equal(await capture(s, batch, 1), 1);
      assert.equal(await capture(s, batch, 2), 0);
      await assert.rejects(capture(s, toList([job(normalize(event(3)))]), 100));
      assert.equal((await client.query('SELECT count(*)::int AS n FROM rocksky_durable_jobs')).rows[0].n, 1);
      const rows = (await client.query('SELECT * FROM rocksky_durable_cursors ORDER BY source')).rows;
      assert.equal(rows.find(row => row.source === s.source).cursor_value, '2');
      assert.equal(rows.find(row => row.source === 'jetstream:v2:live').cursor_value, '99');
    } finally { await client.end(); }
  });

test('mixed archive blocks filter sync payloads before strict wire validation', async () => {
  // Exercise the patched SDK internals from this package's installed copy.
  const base = new URL('.', import.meta.resolve('@bsky/jetstream'));
  const { makeSelector } = await import(new URL('engine/selector.js', base));
  const { rawEventFromSegment } = await import(new URL('decode-event.js', base));
  const row = { seq: 24355929627, did: 'did:plc:abcdefghijklmnopqrstuvwx',
    witnessedAt: 1792324800000000, indexedAt: 0, kind: 6,
    collection: '', rkey: '', rev: '', payload: encode({}) };
  const decode = value => rawEventFromSegment(value, {
    validateWire: true, sha256: bytes => createHash('sha256').update(bytes).digest(),
  });
  assert.throws(() => decode(row), /sync payload/);
  const selector = makeSelector({ kinds: ['commit'], collections: ['app.rocksky.*'],
    window: { afterSeq: 0 } });
  const commit = { ...row, seq: row.seq + 1, kind: 1, collection: 'app.rocksky.artist',
    rkey: '3my55gcmfos2r', rev: '3my55gcmfos2r' };
  const events = [row, commit].filter(r => selector.keep(r)).map(decode);
  assert.equal(events.length, 1);
  assert.equal(events[0].seq, commit.seq);
  assert.equal(events[0].kind, 'commit');
  assert.throws(() => decode({ ...commit, rev: 'invalid' }), /commit row/);
  assert.equal(selector.keep({ ...commit, collection: 'app.bsky.feed.post' }), false);
  assert.equal(makeSelector({ collections: [] }).keep(row), true);
  assert.equal(makeSelector({ collections: [], kinds: ['sync'] }).keep(row), true);
  // Ensure the public snapshot implementation passes kinds to the row selector.
  const source = await (await import('node:fs/promises')).readFile(new URL('jetstream.js', base), 'utf8');
  assert.match(source, /makeSelector\(\{\s*kinds: opts.kinds/);
});
