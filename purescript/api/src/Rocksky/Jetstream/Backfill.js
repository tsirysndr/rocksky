import { parseArgs } from 'node:util';
import pg from 'pg';
import { Jetstream, parseRawRecord } from '@bsky/jetstream';
import { lexToJson } from '@atproto/lex';

const sequence = (value, name) => {
  if (value == null) return null;
  if (!/^\d+$/.test(String(value))) throw new Error(`${name} must be a sequence number`);
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0 || n >= 1e15) throw new Error(`${name} must be a v2 sequence (< 1e15), not a timestamp`);
  return n;
};

export const options = () => {
  // bin/run.js keeps its PureScript module name in argv[2].
  const { values } = parseArgs({ args: process.argv.slice(3), options: {
    service: { type: 'string' }, 'after-seq': { type: 'string' }, 'before-seq': { type: 'string' },
    'batch-size': { type: 'string' }, limit: { type: 'string' },
    'dry-run': { type: 'boolean' }, help: { type: 'boolean' },
  }});
  const url = new URL(values.service ?? process.env.JETSTREAM_BACKFILL_URL ?? 'https://jetstream.us-west.bsky.network');
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Use a Jetstream v2 HTTP(S) origin without credentials, paths, or query parameters');
  }
  const batchSize = sequence(values['batch-size'] ?? '250', 'batch-size');
  if (batchSize < 1 || batchSize > 1000) throw new Error('batch-size must be between 1 and 1000');
  const limit = sequence(values.limit, 'limit');
  if (limit === 0) throw new Error('limit must be positive');
  const afterSeq = sequence(values['after-seq'], 'after-seq');
  const beforeSeq = sequence(values['before-seq'], 'before-seq');
  if (beforeSeq !== null && beforeSeq <= (afterSeq ?? 0)) throw new Error('before-seq must be greater than after-seq');
  const database = process.env.SUBMISSIONS_DATABASE_URL ?? '';
  if (!values.help && !values['dry-run'] && !/^postgres(?:ql)?:\/\//.test(database)) {
    throw new Error('SUBMISSIONS_DATABASE_URL must explicitly name the Postgres durable queue; start rockskyd jetstream once to initialize it');
  }
  return { service: url.origin, apiKey: process.env.JETSTREAM_API_KEY ?? '', database,
    afterSeq, beforeSeq, batchSize, limit, dryRun: values['dry-run'] ?? false, help: values.help ?? false };
};

// SDK raw snapshots contain DAG-CBOR. Convert through the lex data model so
// CID/blob/byte values have the same wire JSON shape as the live Rust subscriber.
export const normalize = event => {
  const c = event.commit;
  if (event.kind !== 'commit' || !c?.collection?.startsWith('app.rocksky.')) throw new Error('Unexpected event outside app.rocksky.* commit filter');
  sequence(event.seq, 'event.seq');
  if (event.seq === 0) throw new Error('event.seq must be positive');
  for (const field of [event.did, c.rev, c.rkey]) if (typeof field !== 'string' || !field) throw new Error('Malformed Jetstream commit identity');
  if (!['create', 'update', 'delete'].includes(c.operation)) throw new Error('Unknown commit operation');
  const millis = Date.parse(event.time);
  const fraction = /\.(\d+)(?:Z|[+-]\d\d:\d\d)$/.exec(event.time)?.[1] ?? '';
  const timeUs = millis * 1000 + Number(fraction.padEnd(6, '0').slice(3, 6));
  if (!Number.isSafeInteger(timeUs) || timeUs <= 0) throw new Error('Invalid Jetstream event time');
  const record = c.operation === 'delete' ? null : lexToJson(parseRawRecord(c.record));
  if (c.operation !== 'delete' && (typeof c.cid !== 'string' || !c.cid)) throw new Error('Missing commit CID');
  return { seq: event.seq, did: event.did, timeUs, rev: c.rev, operation: c.operation,
    collection: c.collection, rkey: c.rkey, record, cid: c.cid ?? null };
};

export const open = opts => async () => {
  const controller = new AbortController();
  const session = { controller, pool: null, client: null, iterator: null,
    source: `jetstream:v2:backfill:${opts.service}:app.rocksky.*`, lastSeq: 0,
    stop: () => controller.abort(new Error('Backfill interrupted; rerun to resume committed batches')) };
  try {
    let after = opts.afterSeq ?? 0;
    if (!opts.dryRun) {
      session.pool = new pg.Pool({ connectionString: opts.database, max: 1, connectionTimeoutMillis: 10000 });
      session.client = await session.pool.connect();
      await session.client.query("SET synchronous_commit = on; SET statement_timeout = '30s'");
      const lock = await session.client.query('SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked', [session.source]);
      if (!lock.rows[0].locked) throw new Error('A backfill for this source is already running');
      // Check schema without creating or modifying the worker-owned tables.
      await session.client.query('SELECT id, kind, request_hash, payload, source, collection, actor, status FROM rocksky_durable_jobs LIMIT 0');
      const { rows } = await session.client.query('SELECT cursor_value FROM rocksky_durable_cursors WHERE source=$1', [session.source]);
      if (rows.length) {
        after = sequence(rows[0].cursor_value, 'saved cursor');
        if (opts.afterSeq !== null && opts.afterSeq !== after) throw new Error('--after-seq conflicts with the saved checkpoint; omit it to resume');
      }
    }
    if (opts.beforeSeq !== null && opts.beforeSeq <= after) throw new Error('before-seq is already covered by the starting checkpoint');
    session.lastSeq = after;
    const sdk = new Jetstream({ service: opts.service, apiKey: opts.apiKey || undefined,
      blockConcurrency: 2, snapshotBufferBytes: 16 * 1024 * 1024, validateWire: true });
    session.iterator = sdk.snapshot({ collections: ['app.rocksky.*'], kinds: ['commit'], raw: true,
      afterSeq: after, ...(opts.beforeSeq === null ? {} : { beforeSeq: opts.beforeSeq }),
      signal: controller.signal, onError: error => { throw error; } })[Symbol.asyncIterator]();
    process.once('SIGINT', session.stop);
    process.once('SIGTERM', session.stop);
    return session;
  } catch (error) {
    await close(session)();
    throw error;
  }
};

export const close = session => async () => {
  session.controller.abort();
  process.removeListener('SIGINT', session.stop);
  process.removeListener('SIGTERM', session.stop);
  try { await session.iterator?.return?.(); }
  finally {
    // Destroy this dedicated connection to release the session advisory lock.
    session.client?.release(true);
    await session.pool?.end();
  }
};

export const next = session => size => async () => {
  const events = [];
  for (let n = 0; n < size; n++) {
    session.controller.signal.throwIfAborted();
    const item = await session.iterator.next();
    session.controller.signal.throwIfAborted();
    if (item.done) break;
    const event = normalize(item.value);
    if (event.seq <= session.lastSeq) throw new Error('Archive sequences are not strictly increasing; refusing to advance checkpoint');
    events.push(event);
    session.lastSeq = event.seq;
  }
  return events;
};

// The Rust Queue::ingest_batch identity and columns, with a separate archive
// checkpoint. Inserts and checkpoint update are atomic, including duplicates.
export const capture = session => jobs => cursor => async () => {
  if (!jobs.length || jobs.length > 1000) throw new Error('Invalid inbox batch size');
  sequence(cursor, 'checkpoint');
  const params = [session.source, cursor];
  const values = jobs.map(job => {
    const start = params.length + 1;
    params.push(job.id, job.requestHash, job.payload, job.collection, job.actor);
    const [id, hash, payload, collection, actor] = Array.from({length:5}, (_, i) => `$${start+i}`);
    const now = 'CAST(FLOOR(EXTRACT(EPOCH FROM clock_timestamp())) AS BIGINT)';
    return `(${id},'jetstream.commit.v1',${hash},${payload},$1,${collection},${actor},'pending',${now},${now},${now})`;
  });
  const { rows } = await session.client.query(`WITH captured AS (
    INSERT INTO rocksky_durable_jobs (id,kind,request_hash,payload,source,collection,actor,status,available_at,created_at,updated_at)
    VALUES ${values.join(',')} ON CONFLICT (id) DO NOTHING RETURNING id
  ), checkpoint AS (
    INSERT INTO rocksky_durable_cursors (source,cursor_value) VALUES ($1,$2)
    ON CONFLICT (source) DO UPDATE SET cursor_value=GREATEST(rocksky_durable_cursors.cursor_value,EXCLUDED.cursor_value)
  ) SELECT count(*)::int AS inserted FROM captured`, params);
  return rows[0].inserted;
};
