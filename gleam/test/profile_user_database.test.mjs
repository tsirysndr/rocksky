import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { createTables } from './helpers/postgres.mjs';
import { save } from '../build/dev/javascript/rocksky_api/rocksky_api/lib/profile_user.mjs';
import { refresh } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/actor/get_profile.mjs';
import { Profile } from '../build/dev/javascript/rocksky_api/rocksky_api/lib/bsky_profile.mjs';
import { Ok } from '../build/dev/javascript/rocksky_api/gleam.mjs';
import { Some, None } from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';

const value = result => {
  assert.ok(result instanceof Ok, JSON.stringify(result));
  return result[0];
};

test('login profiles accept absent metadata and upsert concurrent DID creation without erasing existing metadata',
  { skip: !process.env.GLEAM_TEST_DATABASE_URL }, async () => {
    const client = new pg.Client({ connectionString: process.env.GLEAM_TEST_DATABASE_URL });
    await client.connect();
    try {
      await createTables(client, ['users']);
      // Match production, whose display_name constraint is stricter than the generated schema.
      await client.query('ALTER TABLE users ALTER COLUMN display_name SET NOT NULL; ALTER TABLE users ADD CONSTRAINT users__pgroll_new_did_key UNIQUE (did)');
      const db = { pool: client };
      const missing = new Profile(new None(), new None());
      const full = new Profile(new Some('https://example.com/avatar'), new Some('Mouselett'));
      const first = value(await save(db, 'did:login', 'mouselett.bsky.social', missing));
      assert.equal(first.display_name[0], '');
      assert.equal(first.avatar, '');
      const updated = value(await save(db, 'did:login', 'renamed.bsky.social', full));
      assert.equal(updated.id, first.id);
      const preserved = value(await save(db, 'did:login', 'mouselett.bsky.social', missing));
      assert.equal(preserved.display_name[0], 'Mouselett');
      assert.equal(preserved.avatar, 'https://example.com/avatar');
      assert.equal(preserved.handle, 'mouselett.bsky.social');

      const events = [];
      const ctx = { db, kv: new Map(), nc: { publish: (subject, body) => events.push({ subject, body }) } };
      // Both XRPC requests observed no user; the second insert must handle the first's row.
      const results = await Promise.all([
        refresh(ctx, 'did:race', 'race.bsky.social', full, new None()),
        refresh(ctx, 'did:race', 'race.bsky.social', missing, new None()),
      ]);
      const users = results.map(value);
      assert.equal(users[0].id, users[1].id);
      assert.equal(users[1].display_name[0], 'Mouselett');
      assert.equal(users[1].avatar, 'https://example.com/avatar');
      assert.equal((await client.query("SELECT count(*)::int AS count FROM users WHERE did='did:race'")).rows[0].count, 1);
      assert.equal(events.length, 2);
      const unchanged = value(await refresh(ctx, 'did:race', 'race.bsky.social', missing, new Some(users[1])));
      assert.equal(unchanged.display_name[0], 'Mouselett');
      assert.equal(events.length, 2);
    } finally { await client.end(); }
  });
