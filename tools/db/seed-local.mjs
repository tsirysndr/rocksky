import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const compose = fileURLToPath(new URL('../../compose.yaml', import.meta.url));
const snapshot = new URL('./seeds/feed-generators.json', import.meta.url);
const literal = value => value == null ? 'NULL' : "'" + String(value).replaceAll("'", "''") + "'";

// Keep existing local users (and their IDs); connect feeds through the owner's DID.
export function seedSql(feeds) {
  if (!Array.isArray(feeds) || feeds.length === 0) throw new Error('Feed snapshot is empty');
  const statements = ['BEGIN;', 'SET LOCAL standard_conforming_strings = on;'];
  for (const feed of feeds) {
    for (const value of [feed.id, feed.uri, feed.did, feed.display_name, feed.owner?.did, feed.owner?.handle]) {
      if (typeof value !== 'string' || !value) throw new Error('Invalid feed snapshot');
    }
    const owner = feed.owner;
    statements.push(`INSERT INTO public.users (did, handle, display_name, avatar)
VALUES (${[owner.did, owner.handle, owner.display_name, owner.avatar ?? ''].map(literal).join(', ')})
ON CONFLICT (did) DO NOTHING;`);
    statements.push(`INSERT INTO public.feeds (xata_id, display_name, description, did, uri, avatar, user_id)
SELECT ${[feed.id, feed.display_name, feed.description, feed.did, feed.uri, feed.avatar].map(literal).join(', ')}, xata_id
FROM public.users WHERE did = ${literal(owner.did)}
ON CONFLICT (uri) DO UPDATE SET display_name = EXCLUDED.display_name,
  description = EXCLUDED.description, did = EXCLUDED.did, avatar = EXCLUDED.avatar,
  user_id = EXCLUDED.user_id;`);
  }
  statements.push('COMMIT;');
  return statements.join('\n');
}

function main() {
  if (process.argv.length > 2) throw new Error('Usage: bun run db:seed (local Compose database only)');
  const feeds = JSON.parse(readFileSync(snapshot, 'utf8'));
  const sql = seedSql(feeds);
  const args = ['compose', '-f', compose];
  const config = spawnSync('docker', [...args, 'config', '--format', 'json'], { encoding: 'utf8' });
  if (config.status !== 0) throw new Error('Cannot read Docker Compose configuration');
  const env = JSON.parse(config.stdout).services.db.environment;
  // Run inside Compose's db container: never use ambient production URLs or Homebrew PostgreSQL.
  const result = spawnSync('docker', [...args, 'exec', '-T', 'db', 'psql', '-X', '-q',
    '-v', 'ON_ERROR_STOP=1', '-U', env.POSTGRES_USER, '-d', env.POSTGRES_DB],
    { input: sql, encoding: 'utf8', stdio: ['pipe', 'inherit', 'inherit'] });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Local feed seed failed; transaction rolled back');
  console.log(`Seeded ${feeds.length} feed generators in Docker PostgreSQL (${env.POSTGRES_DB}).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
