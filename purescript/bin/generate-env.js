import { randomBytes } from 'node:crypto';
import { readFile, writeFile, chmod } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { parse } from 'yaml';

function publishedPort(service, target) {
  for (const entry of service?.ports ?? []) {
    const parts = typeof entry === 'object'
      ? [entry.published, entry.target, entry.protocol ?? 'tcp']
      : (() => {
          const [mapping, protocol = 'tcp'] = String(entry).split('/');
          const ports = mapping.split(':');
          return [ports.length > 1 ? ports.at(-2) : undefined, ports.at(-1), protocol];
        })();
    if (Number(parts[1]) === target && parts[2] === 'tcp') {
      const port = Number(parts[0]);
      if (Number.isInteger(port) && port > 0 && port <= 65535) return port;
    }
  }
  throw new Error(`Compose must publish a fixed TCP host port for container port ${target}`);
}

export function generateEnv(compose) {
  const { db, nats, dragonfly, typesense } = compose.services ?? {};
  const database = Array.isArray(db?.environment)
    ? Object.fromEntries(db.environment.map(entry => {
        const i = entry.indexOf('=');
        return [entry.slice(0, i), entry.slice(i + 1)];
      }))
    : db?.environment;
  for (const key of ['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB']) {
    if (!database?.[key]) throw new Error(`Compose db.environment.${key} is required`);
  }
  const command = Array.isArray(typesense?.command) ? typesense.command.join(' ') : typesense?.command ?? '';
  const apiKey = command.match(/(?:^|\s)--api-key(?:=|\s+)([^\s]+)/)?.[1];
  if (!apiKey) throw new Error('Compose typesense.command must set --api-key');
  const pg = `postgresql://${encodeURIComponent(database.POSTGRES_USER)}:${encodeURIComponent(database.POSTGRES_PASSWORD)}@127.0.0.1:${publishedPort(db, 5432)}/${encodeURIComponent(database.POSTGRES_DB)}?sslmode=disable`;
  const secret = (bytes = 32) => randomBytes(bytes).toString('hex');
  const sections = [
    ['Local development: run the API on the host; infrastructure comes from ../compose.yaml.', {
      NODE_ENV: 'development', HOST: 'localhost', PORT: 8000, ROCKSKY_XPRC_PORT: 3004,
      PUBLIC_URL: 'http://localhost:8000', FRONTEND_URL: 'http://localhost:5174',
      DB_PATH: './rocksky-dev.sqlite', KV_DB_PATH: './rocksky-kv-dev.sqlite',
    }],
    ['Docker Compose endpoints (host ports, not container ports).', {
      XATA_POSTGRES_URL: pg, XATA_WRITE_POSTGRES_URL: pg, XATA_READ_POSTGRES_URL: pg,
      PG_APP_NAME: 'rocksky-purescript-local', PG_MAX_CONNECTIONS: 10, PG_STATEMENT_TIMEOUT: 60000,
      NATS_URL: `nats://127.0.0.1:${publishedPort(nats, 4222)}`,
      REDIS_URL: `redis://127.0.0.1:${publishedPort(dragonfly, 6379)}`,
      TYPESENSE_HOST: '127.0.0.1', TYPESENSE_PORT: publishedPort(typesense, 8108),
      TYPESENSE_PROTOCOL: 'http', TYPESENSE_API_KEY: apiKey,
    }],
    ['Generated local-only secrets. Share SUBMISSIONS_SECRET with the local submissions worker.', {
      COOKIE_SECRET: secret(), JWT_SECRET: secret(), ROCKSKY_BETA_TOKEN: secret(),
      SPOTIFY_ENCRYPTION_KEY: secret(), SPOTIFY_ENCRYPTION_IV: secret(16),
      STORAGE_ENCRYPTION_KEY: secret(), SUBMISSIONS_SECRET: secret(), NAVIDROME_INTERNAL_SECRET: secret(),
    }],
    ['Submissions worker: use this same environment for the API and worker.', {
      SUBMISSIONS_DATABASE_URL: pg, SUBMISSIONS_BIND: '127.0.0.1:8098',
      SUBMISSIONS_API_URL: 'http://127.0.0.1:8000/internal/submissions/process',
      SUBMISSIONS_TEAL_API_URL: 'http://127.0.0.1:8000/internal/submissions/tealfm/process',
      SUBMISSIONS_CONCURRENCY: 8, SUBMISSIONS_TEAL_CONCURRENCY: 4, SUBMISSIONS_MAX_ATTEMPTS: 20,
      SUBMISSIONS_CLEANUP_ENABLED: true, SUBMISSIONS_COMPLETED_RETENTION_SECONDS: 604800,
      SUBMISSIONS_DEDUP_RETENTION_SECONDS: 7776000, SUBMISSIONS_CLEANUP_INTERVAL_SECONDS: 300,
      SUBMISSIONS_CLEANUP_BATCH_SIZE: 500, SUBMISSIONS_DASHBOARD_CACHE_SECONDS: 30,
      SUBMISSIONS_CORS_ORIGINS: '',
    }],
    ['Companion services must be started separately; compose.yaml does not provide them.', {
      SUBMISSIONS_URL: 'http://127.0.0.1:8098', MATCHING_URL: 'http://127.0.0.1:8097',
      ANALYTICS: 'http://127.0.0.1:7879',
      TRACKLIST: 'http://127.0.0.1:7884',
      MUSICBRAINZ_URL: 'http://127.0.0.1:8088', DEEZER_URL: 'http://127.0.0.1:8090',
      DISCOGS_URL: 'http://127.0.0.1:8095', DISCOGS_ENRICHMENT_ENABLED: false,
      NAVIDROME_INTERNAL_URL: 'http://127.0.0.1:4533',
      ROCKSKY_FEEDGEN_DID: 'did:web:discover.rocksky.app', ROCKSKY_FEEDGEN_PORT: 8002,
    }],
    ['Optional integrations: supply your own development credentials.', {
      SPOTIFY_CLIENT_ID: '', SPOTIFY_CLIENT_SECRET: '', SPOTIFY_API_URL: 'https://api.spotify.com/v1',
      SPOTIFY_REDIRECT_URI: 'http://localhost:8000/spotify/callback',

    }],
    ['Localhost ATProto OAuth does not require private signing keys.', {
      PRIVATE_KEY_1: '', PRIVATE_KEY_2: '', PRIVATE_KEY_3: '', PDS_HOST_OVERRIDES: '', DISABLED_TEALFM: '',
    }],
    ['Optional local S3 server (not in Compose). Replace placeholders to enable uploads.', {
      S3_ENDPOINT: 'http://127.0.0.1:9000', S3_REGION: 'us-east-1',
      S3_ACCESS_KEY_ID: 'local-development', S3_SECRET_ACCESS_KEY: 'local-development',
      S3_BUCKET_NAME: 'rocksky-library', S3_COVERS_BUCKET_NAME: 'rocksky',
      CDN_URL: 'http://127.0.0.1:9000/rocksky', MEDIA_CDN_URL: 'http://127.0.0.1:9000/rocksky-library',
    }],
  ];
  return sections.map(([comment, entries]) => `# ${comment}\n` + Object.entries(entries).map(([key, value]) => {
    const text = String(value);
    if (/[\r\n']/.test(text)) throw new Error(`Unsupported quote or newline in ${key}`);
    return `${key}='${text}'`;
  }).join('\n')).join('\n\n') + '\n';
}

export async function writeEnv(path, content, force = false) {
  await writeFile(path, content, { flag: force ? 'w' : 'wx', mode: 0o600 });
  await chmod(path, 0o600);
}

async function main() {
  const { values } = parseArgs({ options: { force: { type: 'boolean' }, help: { type: 'boolean' } } });
  if (values.help) {
    console.log('Usage: bun run env:generate [--force]\nReads ../compose.yaml and writes purescript/.env.\n--force replaces existing settings and regenerates all local secrets.');
    return;
  }
  const source = await readFile(new URL('../../compose.yaml', import.meta.url), 'utf8');
  if (source.includes('${')) throw new Error('Compose interpolation is not supported; use literal development settings.');
  const content = generateEnv(parse(source));
  const target = new URL('../.env', import.meta.url);
  try {
    await writeEnv(target, content, values.force);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('.env already exists; use --force only to replace it and regenerate secrets.');
    throw error;
  }
  console.log(`Created ${fileURLToPath(target)} (mode 0600). Third-party credentials are blank; no services started.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
