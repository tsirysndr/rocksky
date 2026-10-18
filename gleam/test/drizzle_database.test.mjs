import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { alias, all, all_columns, count, delete$, eq, field, from, insert as insertMutation, left_join, nested, on_conflict_do_nothing, on_conflict_update, one, optional_selection, pair, conflict_target, returning, run, select, set, transaction, update, where } from '../build/dev/javascript/rocksky_api/rocksky_api/drizzle/orm.mjs';
import * as artists from '../build/dev/javascript/rocksky_api/rocksky_api/drizzle/schema/artists.mjs';
import { Ok, Error as GError, toList } from '../build/dev/javascript/rocksky_api/gleam.mjs';
import { Some, None } from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';

const unwrap = async task => {
  const result = await task;
  assert.ok(result instanceof Ok, JSON.stringify(result));
  return result[0];
};
test('Drizzle executes typed projections, mutations, nullable joins and transaction rollback', {skip: !process.env.GLEAM_TEST_PGHOST}, async () => {
  const pool = new pg.Pool({host:process.env.GLEAM_TEST_PGHOST, port:Number(process.env.GLEAM_TEST_PGPORT), database:'postgres', max:1});
  const db = {pool};
  const t = artists.table();
  const byId = id => eq(artists.id(t),id);
  try {
    await pool.query(`CREATE TEMP TABLE artists (xata_id text PRIMARY KEY, name text NOT NULL, biography text, born timestamp, born_in text,
      died timestamp, picture text, sha256 text UNIQUE NOT NULL, uri text, apple_music_link text, spotify_link text, tidal_link text,
      youtube_link text, genres text[], xata_createdat timestamp DEFAULT now(), xata_updatedat timestamp DEFAULT now(), xata_version int)`);
    const insert = id => insertMutation(t,toList([
      set(artists.id(t),id), set(artists.name(t),"Artist's name"), set(artists.sha256(t),id),
      set(artists.genres(t),new Some(toList(['rock','jazz']))),
    ]));
    const rows = (await unwrap(returning(insert('one'),db))).toArray();
    assert.equal(rows[0].name,"Artist's name");
    assert.deepEqual(rows[0].genres[0].toArray(),['rock','jazz']);
    assert.ok(rows[0].created_at);
    assert.equal(await unwrap(run(on_conflict_do_nothing(insert('one')),db)),0);
    assert.equal(await unwrap(run(on_conflict_update(insert('one'),toList([conflict_target(artists.id(t))]),toList([set(artists.name(t),'Updated')])),db)),1);
    const other = alias(t,'other');
    const joined = left_join(select(t,pair(field('name',artists.name(t)),nested('other',optional_selection(all_columns(other))))),other,eq(artists.id(other),'missing'));
    const projected=(await unwrap(all(joined,db))).toArray();
    assert.equal(projected[0][0],'Updated');
    assert.ok(projected[0][1] instanceof None);
    const total=select(t,field('count',count()));
    assert.equal((await unwrap(all(total,db))).toArray()[0],1);
    const rollback=await transaction(db,async scoped=>{
      await unwrap(run(insert('rolled-back'),scoped));
      return new GError('deliberate rollback');
    });
    assert.ok(rollback instanceof GError);
    assert.ok(await unwrap(one(where(from(t),byId('rolled-back')),db)) instanceof None);
    await unwrap(transaction(db, scoped=>run(insert('committed'),scoped)));
    assert.ok(await unwrap(one(where(from(t),byId('committed')),db)) instanceof Some);
    assert.equal(await unwrap(run(update(t,toList([set(artists.name(t),'Changed')]),byId('one')),db)),1);
    assert.equal(await unwrap(run(delete$(t,byId('one')),db)),1);
  } finally { await pool.end(); }
});
