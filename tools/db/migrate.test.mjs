import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { migrate, readMigrations, splitStatements } from './migrate.mjs';
const source = fileURLToPath(new URL('../../apps/api/drizzle', import.meta.url));
const gleam = fileURLToPath(new URL('../../gleam/drizzle', import.meta.url));
test('all SQL files are registered once and both migration copies agree', async () => {
  const a = await readMigrations(source), b = await readMigrations(gleam);
  assert.deepEqual(a, b);
  assert.deepEqual(a.map(e => e.idx), a.map((_, i) => i));
  assert.equal(new Set(a.map(e=>e.when)).size,a.length);
  for (const e of a) if (e.statements.some(s=> /(?:CREATE(?: UNIQUE)? INDEX|DROP INDEX)\s+CONCURRENTLY/.test(s))) assert.equal(e.transaction, false);
});
test('SQL splitter preserves procedural blocks, strings and comments', () => {
  const statements=splitStatements(`-- comment;\nCREATE TABLE "semi;colon" (value text); DO $body$ BEGIN PERFORM ';'; END $body$; SELECT 'it''s;quoted'; /* outer; /* nested; */ */ SELECT 1; -- trailing;`);
  assert.equal(statements.length,4);
  assert.match(statements[1],/END \$body\$;/);
  assert.throws(()=>splitStatements("SELECT 'unfinished"), /Unterminated/);
});
test('full migration history, reruns and older missing entries', {skip:!process.env.ROCKSKY_MIGRATION_TEST_URL}, async()=>{
  const url=new URL(process.env.ROCKSKY_MIGRATION_TEST_URL);
  assert.ok(['127.0.0.1','localhost'].includes(url.hostname));
  const admin=new pg.Client({connectionString:url.href});
  const name='rocksky_migrations_'+randomBytes(6).toString('hex');
  const directory=await mkdtemp(join(tmpdir(),'rocksky-migrations-'));
  let pool,created=false;
  try {
    await admin.connect(); await admin.query(`CREATE DATABASE "${name}"`); created=true;
    url.pathname='/'+name;pool=new pg.Pool({connectionString:url.href,max:1});
    const entries=await readMigrations(source);
    assert.equal(await migrate(pool,source),entries.length);
    assert.equal(await migrate(pool,gleam),0);
    await pool.query('SELECT discogs_release_id FROM albums LIMIT 0');
    const {rows}=await pool.query("SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='display_name'");
    assert.equal(rows[0].is_nullable,'YES');
    await mkdir(join(directory,'meta'));
    await writeFile(join(directory,'meta/_journal.json'),JSON.stringify({entries:[{idx:0,when:1,tag:'old_missing'}]}));
    await writeFile(join(directory,'old_missing.sql'),'CREATE TABLE old_missing (id integer);');
    assert.equal(await migrate(pool,directory),1);
    assert.equal(await migrate(pool,directory),0);
  } finally {
    if(pool)await pool.end();
    if(created)await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();await rm(directory,{recursive:true,force:true});
  }
});
