// Shared database/HTTP bindings for the PureScript and Gleam repair commands.
import { parseArgs } from 'node:util';
import pg from 'pg';
import { setTimeout as pause } from 'node:timers/promises';

export function parseOptions(args, env = process.env) {
  const {values:v} = parseArgs({args, options:{
    'dry-run':{type:'boolean'}, help:{type:'boolean'}, limit:{type:'string'},
    'batch-size':{type:'string'}, 'delay-ms':{type:'string'}, 'api-url':{type:'string'},
  }});
  const integer = (value, fallback, min, max, name) => {
    const n = Number(value ?? fallback);
    if (!/^\d+$/.test(String(value ?? fallback)) || !Number.isSafeInteger(n) || n < min || n > max) throw new Error(`Invalid ${name}: expected ${min}–${max}`);
    return n;
  };
  const api = new URL(v['api-url'] ?? env.ROCKSKY_PICTURE_API_URL ?? 'https://api.rocksky.app');
  if (!['http:','https:'].includes(api.protocol) || api.username || api.password || api.search || api.hash || api.pathname !== '/') throw new Error('api-url must be an HTTP(S) origin');
  const database = env.XATA_WRITE_POSTGRES_URL || env.XATA_POSTGRES_URL || '';
  if (!v.help && !/^postgres(?:ql)?:\/\//.test(database)) throw new Error('Set XATA_WRITE_POSTGRES_URL or XATA_POSTGRES_URL to the target database');
  return {help:v.help ?? false, dryRun:v['dry-run'] ?? false,
    limit:integer(v.limit,0,0,2147483647,'limit'), batchSize:integer(v['batch-size'],30,1,30,'batch-size'),
    delayMs:integer(v['delay-ms'],500,100,60000,'delay-ms'), apiUrl:api.origin, database};
}

export function retryAfterMs(value, now = Date.now()) {
  if (value == null) return 0;
  const seconds = Number(value);
  if (value.trim() !== '' && Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}

function rateLimitDelay(headers, now) {
  const remaining = headers.get('ratelimit-remaining') ?? headers.get('x-ratelimit-remaining');
  if (remaining !== '0') return 0;
  const reset = Number(headers.get('ratelimit-reset') ?? headers.get('x-ratelimit-reset'));
  return Number.isFinite(reset) && reset > 0 ? Math.max(0, reset * 1000 - now) : 0;
}

export function selectPictures(artists, remote) {
  if (!Array.isArray(remote)) throw new Error('Rocksky API response is missing artists');
  const wanted = new Map(artists.map(a=>[a.sha256,a]));
  const found = new Map();
  for (const artist of remote) {
    const local = wanted.get(artist?.sha256);
    if (!local || typeof artist.picture !== 'string' || !artist.picture.trim()) continue;
    let url;
    try { url = new URL(artist.picture); } catch { continue; }
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password) continue;
    const picture = artist.picture.trim();
    if (found.has(local.id) && found.get(local.id).picture !== picture) throw new Error('Ambiguous pictures for one artist hash');
    found.set(local.id, {id:local.id,sha256:local.sha256,picture});
  }
  return [...found.values()];
}

// Dependencies are injectable for rate-limit and network failure regressions.
export async function fetchPictures(session, artists, deps = {}) {
  const request = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? (ms=>pause(ms, undefined, {signal:session.controller.signal}));
  const random = deps.random ?? Math.random;
  for (const artist of artists) if (!/^[a-f0-9]{64}$/.test(artist.sha256)) throw new Error(`Invalid artist hash for ${artist.id}`);
  const url = new URL('/xrpc/app.rocksky.artist.getArtists', session.opts.apiUrl);
  url.searchParams.set('filter', `sha256=in=(${artists.map(a=>a.sha256).join(',')})`);
  url.searchParams.set('limit', String(artists.length));
  for (let attempt = 0; attempt < 6; attempt++) {
    const wait = Math.max(0, session.nextRequestAt - now());
    if (wait) await sleep(wait);
    session.controller.signal.throwIfAborted();
    let response;
    try {
      response = await request(url, {signal:AbortSignal.any([session.controller.signal, AbortSignal.timeout(30000)])});
    } catch (error) {
      session.controller.signal.throwIfAborted();
      if (attempt === 5) throw new Error('Rocksky API network retries exhausted', {cause:error});
      const backoff = Math.min(60000, 1000 * 2 ** attempt) + Math.floor(random()*250);
      session.nextRequestAt = now() + backoff;
      console.warn(`Rocksky API network error; retrying in ${backoff}ms`);
      continue;
    }
    session.nextRequestAt = now() + Math.max(session.opts.delayMs, rateLimitDelay(response.headers, now()));
    if (response.status === 429 || response.status === 408 || response.status >= 500) {
      const delay = Math.max(session.opts.delayMs, retryAfterMs(response.headers.get('retry-after'), now()),
        rateLimitDelay(response.headers, now()), Math.min(60000, 1000*2**attempt) + Math.floor(random()*250));
      await response.body?.cancel();
      if (attempt === 5) throw new Error(`Rocksky API HTTP ${response.status}: retries exhausted; rerun to retry missing pictures`);
      session.nextRequestAt = now() + delay;
      console.warn(`Rocksky API HTTP ${response.status}; retrying in ${delay}ms`);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Rocksky API HTTP ${response.status}`);
    }
    return selectPictures(artists, (await response.json()).artists);
  }
}

export async function openRepair(opts) {
  const controller = new AbortController();
  const pool = new pg.Pool({connectionString:opts.database,max:1,connectionTimeoutMillis:10000,statement_timeout:30000});
  const session = {opts,pool,controller,cursor:'',upper:'',nextRequestAt:0,
    stop:()=>controller.abort(new Error('Artist picture repair interrupted'))};
  try {
    const {rows} = await pool.query('SELECT max(xata_id) AS upper FROM artists');
    session.upper = rows[0].upper ?? '';
    process.once('SIGINT',session.stop); process.once('SIGTERM',session.stop);
    return session;
  } catch(error) {await pool.end(); throw error;}
}

export async function closeRepair(session) {
  session.controller.abort();
  process.removeListener('SIGINT',session.stop); process.removeListener('SIGTERM',session.stop);
  await session.pool.end();
}

export async function savePictures(pool, pictures) {
  if (!pictures.length) return 0;
  const result = await pool.query(`UPDATE artists a SET picture=p.picture
    FROM jsonb_to_recordset($1::jsonb) AS p(id text, sha256 text, picture text)
    WHERE a.xata_id=p.id AND a.sha256=p.sha256 AND (a.picture IS NULL OR btrim(a.picture)='')`, [JSON.stringify(pictures)]);
  return result.rowCount;
}

export async function repairBatch(session, size) {
  session.controller.signal.throwIfAborted();
  const {rows} = await session.pool.query(`SELECT xata_id AS id, name, sha256 FROM artists
    WHERE xata_id > $1 AND xata_id <= $2 AND (picture IS NULL OR btrim(picture)='') ORDER BY xata_id LIMIT $3`,
    [session.cursor,session.upper,size]);
  if (!rows.length) return {scanned:0,matched:0,updated:0};
  const pictures = await fetchPictures(session,rows);
  const updated = session.opts.dryRun ? 0 : await savePictures(session.pool,pictures);
  session.cursor = rows.at(-1).id;
  return {scanned:rows.length,matched:pictures.length,updated};
}

export const help = 'Usage: bun run repair:artist-pictures [--dry-run] [--limit N] [--batch-size 1..30] [--delay-ms N] [--api-url URL]\nFills only missing artist pictures from https://api.rocksky.app, matching exact SHA-256. Uses the configured XATA_WRITE_POSTGRES_URL/XATA_POSTGRES_URL. Requests are paced, honor Retry-After and retry transient failures. No PDS records are changed.';
