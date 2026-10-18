import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Keep quoted strings, identifiers, comments and dollar-quoted DO blocks intact.
export function splitStatements(sql) {
  const statements = [];
  let start = 0, quote = null, dollar = null, block = 0, line = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i], next = sql[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) {
      if (c === '/' && next === '*') { block++; i++; }
      else if (c === '*' && next === '/') { block--; i++; }
      continue;
    }
    if (dollar) { if (sql.startsWith(dollar, i)) { i += dollar.length - 1; dollar = null; } continue; }
    if (quote) {
      if (c === quote) { if (next === quote) i++; else quote = null; }
      continue;
    }
    if (c === '-' && next === '-') { line = true; i++; }
    else if (c === '/' && next === '*') { block = 1; i++; }
    else if (c === "'" || c === '"') quote = c;
    else if (c === '$') {
      const tag = sql.slice(i).match(/^\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/)?.[0];
      if (tag) { dollar = tag; i += tag.length - 1; }
    } else if (c === ';') { statements.push(sql.slice(start, i + 1)); start = i + 1; }
  }
  if (quote || dollar || block) throw new Error('Unterminated SQL quote or comment');
  statements.push(sql.slice(start));
  return statements.filter(s => s.replace(/--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\//g, '').trim());
}

export async function readMigrations(dir) {
  const journal = JSON.parse(await readFile(`${dir}/meta/_journal.json`, 'utf8'));
  const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort();
  const tags = journal.entries.map(e => `${e.tag}.sql`);
  if (new Set(tags).size !== tags.length || files.some(f => !tags.includes(f)) || tags.some(f => !files.includes(f)))
    throw new Error('Every SQL migration must be registered exactly once in the journal');
  return Promise.all(journal.entries.map(async entry => {
    const sql = await readFile(`${dir}/${entry.tag}.sql`, 'utf8');
    return {...entry, hash: createHash('sha256').update(sql).digest('hex'), statements: splitStatements(sql)};
  }));
}

export async function migrate(pool, dir) {
  const migrations = await readMigrations(dir);
  const client = await pool.connect();
  try {
    // Serialize migrations across all ports, including nontransactional indexes.
    await client.query("SELECT pg_advisory_lock(721406219)");
    await client.query('CREATE SCHEMA IF NOT EXISTS drizzle');
    await client.query('CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)');
    const {rows} = await client.query('SELECT hash, created_at FROM drizzle.__drizzle_migrations');
    const applied = new Set(rows.map(r => r.hash));
    const timestamps = new Set(rows.map(r => Number(r.created_at)));
    let count = 0;
    for (const entry of migrations) {
      // A timestamp high-water mark skips older unregistered migrations.
      if (applied.has(entry.hash) || timestamps.has(entry.when)) continue;
      const transactional = entry.transaction !== false;
      console.log(`Applying ${entry.tag}`);
      if (transactional) await client.query('BEGIN');
      try {
        for (const statement of entry.statements) await client.query(statement);
        await client.query('INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)', [entry.hash, entry.when]);
        if (transactional) await client.query('COMMIT');
      } catch (cause) {
        if (transactional) await client.query('ROLLBACK');
        throw new Error(`Migration ${entry.tag} failed`, {cause});
      }
      applied.add(entry.hash); timestamps.add(entry.when); count++;
    }
    return count;
  } finally {
    try { await client.query('SELECT pg_advisory_unlock(721406219)'); }
    finally { client.release(); }
  }
}
