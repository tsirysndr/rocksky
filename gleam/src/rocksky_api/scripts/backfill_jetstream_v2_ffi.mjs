// Transport and database bindings. Replay control and job identities live in Gleam.
import 'dotenv/config';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { pgTable, text, bigint } from 'drizzle-orm/pg-core';
import { eq, sql } from 'drizzle-orm';
import { Jetstream, parseRawRecord } from '@bsky/jetstream';
import { lexToJson } from '@atproto/lex';
import { toList } from '../../gleam.mjs';
import { Options, Event } from './backfill_jetstream_v2.mjs';

const number = (value, name) => {
  if (value == null) return undefined;
  if (!/^\d+$/.test(String(value))) throw new Error(`${name} must be a nonnegative integer`);
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error(`${name} exceeds the safe integer range`);
  return n;
};

export function parseOptions(args, env = process.env) {
  const { values: v } = parseArgs({ args, options: {
    service: { type: 'string' }, cursor: { type: 'string' }, 'after-seq': { type: 'string' }, 'before-seq': { type: 'string' },
    'batch-size': { type: 'string' }, limit: { type: 'string' },
    'dry-run': { type: 'boolean' }, help: { type: 'boolean' },
  }});
  const opts = new Options(v.help ?? false, v['dry-run'] ?? false,
    number(v['batch-size'] ?? '250', 'batch-size'), number(v.limit, 'limit') ?? 0);
  const url = new URL(v.service ?? env.JETSTREAM_BACKFILL_URL ?? 'https://jetstream.us-west.bsky.network');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('service must be an HTTP(S) origin without credentials, paths or queries');
  }
  if (opts.batch_size < 1 || opts.batch_size > 1000) throw new Error('batch-size must be between 1 and 1000');
  if (v.limit !== undefined && opts.limit === 0) throw new Error('limit must be positive');
  opts.service = url.origin;
  if (v.cursor !== undefined && v['after-seq'] !== undefined) throw new Error('Use either --cursor or --after-seq, not both');
  opts.after = number(v.cursor ?? v['after-seq'], 'cursor/after-seq');
  opts.before = number(v['before-seq'], 'before-seq');
  if (opts.before !== undefined && opts.before <= (opts.after ?? 0)) throw new Error('before-seq must be greater than after-seq');
  opts.apiKey = env.JETSTREAM_API_KEY || undefined;
  opts.database = env.SUBMISSIONS_DATABASE_URL;
  if (!opts.help && !opts.dry_run && !/^postgres(?:ql)?:\/\//.test(opts.database ?? '')) {
    throw new Error('Set SUBMISSIONS_DATABASE_URL to the PostgreSQL durable queue initialized by rockskyd jetstream');
  }
  return opts;
}
export const options = async () => parseOptions(process.argv.slice(2));

// These worker-owned tables are intentionally excluded from API migrations.
export const jobs = pgTable('rocksky_durable_jobs', {
  id: text('id').primaryKey(), kind: text('kind'), request_hash: text('request_hash'),
  payload: text('payload'), source: text('source'), collection: text('collection'),
  actor: text('actor'), status: text('status'),
  available_at: bigint('available_at', { mode: 'number' }),
  created_at: bigint('created_at', { mode: 'number' }), updated_at: bigint('updated_at', { mode: 'number' }),
});
export const cursors = pgTable('rocksky_durable_cursors', {
  source: text('source').primaryKey(), cursor_value: bigint('cursor_value', { mode: 'number' }),
});

export function normalize(event) {
  const c = event.commit;
  if (event.kind !== 'commit' || !c?.collection?.startsWith('app.rocksky.')) throw new Error('Unexpected event outside app.rocksky.* commits');
  if (!Number.isSafeInteger(event.seq) || event.seq <= 0) throw new Error('Invalid archive sequence');
  for (const value of [event.did, c.rkey, c.rev]) if (typeof value !== 'string' || !value) throw new Error('Missing commit identity');
  if (!['create', 'update', 'delete'].includes(c.operation)) throw new Error('Unsupported commit operation');
  const fraction = /\.(\d+)(?:Z|[+-]\d\d:\d\d)$/.exec(event.time)?.[1] ?? '';
  const time_us = Date.parse(event.time) * 1000 + Number(fraction.padEnd(6, '0').slice(3, 6));
  if (!Number.isSafeInteger(time_us) || time_us <= 0) throw new Error('Invalid event time');
  if (c.operation !== 'delete' && (typeof c.cid !== 'string' || !c.cid)) throw new Error('Missing commit CID');
  const payload = JSON.stringify({ did: event.did, time_us, kind: 'commit', commit: {
    rev: c.rev, operation: c.operation, collection: c.collection, rkey: c.rkey,
    record: c.operation === 'delete' ? null : lexToJson(parseRawRecord(c.record)), cid: c.cid ?? null,
  }});
  return new Event(event.seq, event.did, c.collection, c.rkey, c.rev, payload);
}

export async function open(opts) {
  const controller = new AbortController();
  const session = { controller, source: `jetstream:backfill:v2:${opts.service}:app.rocksky.*`,
    stop: () => controller.abort(new Error('Interrupted; rerun to resume committed batches')) };
  try {
    let after = opts.after ?? 0;
    if (!opts.dry_run) {
      session.pool = new pg.Pool({ connectionString: opts.database, max: 1, connectionTimeoutMillis: 10000 });
      session.client = await session.pool.connect();
      session.db = drizzle(session.client);
      await session.db.execute(sql`SET synchronous_commit = on`);
      await session.db.execute(sql`SET statement_timeout = '30s'`);
      const lock = await session.db.execute(sql`SELECT pg_try_advisory_lock(hashtextextended(${session.source}, 0)) AS locked`);
      if (!lock.rows[0].locked) throw new Error('A backfill for this source is already running');
      await session.db.select().from(jobs).limit(0);
      const rows = await session.db.select().from(cursors).where(eq(cursors.source, session.source));
      if (rows.length) {
        after = number(rows[0].cursor_value, 'saved cursor');
        if (opts.after !== undefined && opts.after !== after) throw new Error('--cursor/--after-seq conflicts with saved checkpoint; omit it to resume');
      }
    }
    if (opts.before !== undefined && opts.before <= after) throw new Error('before-seq is already covered by starting checkpoint');
    session.lastSeq = after;
    const sdk = new Jetstream({ service: opts.service, apiKey: opts.apiKey,
      blockConcurrency: 2, snapshotBufferBytes: 16 * 1024 * 1024, validateWire: true });
    session.iterator = sdk.snapshot({ collections: ['app.rocksky.*'], kinds: ['commit'], raw: true,
      afterSeq: after, beforeSeq: opts.before, signal: controller.signal,
      onError: error => { throw error; } })[Symbol.asyncIterator]();
    process.once('SIGINT', session.stop);
    process.once('SIGTERM', session.stop);
    return session;
  } catch (error) {
    await close(session);
    throw error;
  }
}

export async function close(session) {
  session.controller.abort();
  process.removeListener('SIGINT', session.stop);
  process.removeListener('SIGTERM', session.stop);
  try { await session.iterator?.return?.(); }
  finally {
    session.client?.release(true); // Destroy dedicated connection, releasing advisory lock.
    await session.pool?.end();
  }
}

export async function next(session, size) {
  const events = [];
  for (let n = 0; n < size; n++) {
    session.controller.signal.throwIfAborted();
    const item = await session.iterator.next();
    session.controller.signal.throwIfAborted();
    if (item.done) break;
    const event = normalize(item.value);
    if (event.seq <= session.lastSeq) throw new Error('Archive sequences must increase; refusing to advance checkpoint');
    events.push(event);
    session.lastSeq = event.seq;
  }
  return toList(events);
}

export async function capture(session, batch, cursor) {
  const input = Array.from(batch);
  if (!input.length || input.length > 1000 || !Number.isSafeInteger(cursor) || cursor <= 0) throw new Error('Invalid capture batch');
  session.controller.signal.throwIfAborted();
  return session.db.transaction(async tx => {
    const now = sql`CAST(FLOOR(EXTRACT(EPOCH FROM clock_timestamp())) AS BIGINT)`;
    const inserted = await tx.insert(jobs).values(input.map(job => ({
      ...job, kind: 'jetstream.commit.v1', source: session.source, status: 'pending',
      available_at: now, created_at: now, updated_at: now,
    }))).onConflictDoNothing({ target: jobs.id }).returning({ id: jobs.id });
    await tx.insert(cursors).values({ source: session.source, cursor_value: cursor }).onConflictDoUpdate({
      target: cursors.source, set: { cursor_value: sql`greatest(${cursors.cursor_value}, ${cursor})` },
    });
    return inserted.length;
  });
}
