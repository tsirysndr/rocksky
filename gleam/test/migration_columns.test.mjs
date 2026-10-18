import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
import {Ok} from '../build/dev/javascript/rocksky_api/gleam.mjs';
import {run} from '../build/dev/javascript/rocksky_api/rocksky_api/scripts/migrate.mjs';

test('Migration journal upgrades old databases with all track analysis columns', {skip:!process.env.GLEAM_MIGRATION_TEST_URL}, async()=>{
 const url=new URL(process.env.GLEAM_MIGRATION_TEST_URL);
 assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));
 const admin=new pg.Client({connectionString:url.href});
 const name='rocksky_migration_test_'+randomBytes(6).toString('hex');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rocksky-journal-'));
 let created=false,pool;
 try {
  await admin.connect();await admin.query(`CREATE DATABASE "${name}"`);created=true;
  url.pathname='/'+name;pool=new pg.Pool({connectionString:url.href,max:1});
  const journal=JSON.parse(fs.readFileSync('drizzle/meta/_journal.json'));
  fs.mkdirSync(path.join(directory,'meta'));
  const old={...journal,entries:journal.entries.filter(e=>!['0025_tracks_key_bpm','0034_tracks_acoustid_fingerprint'].includes(e.tag))};
  fs.writeFileSync(path.join(directory,'meta/_journal.json'),JSON.stringify(old));
  for(const e of old.entries)fs.copyFileSync(`drizzle/${e.tag}.sql`,path.join(directory,`${e.tag}.sql`));
  const db={pool,cancel:pool,label:'migration-test'};
  let result=await run(db,directory);assert.ok(result instanceof Ok,JSON.stringify(result));
  result=await run(db,'drizzle');assert.ok(result instanceof Ok,JSON.stringify(result));assert.equal(result[0],2);
  await pool.query('SELECT key, bpm, acoustid_fingerprint FROM tracks LIMIT 0');
  result=await run(db,'drizzle');assert.ok(result instanceof Ok);assert.equal(result[0],0);
  // PureScript uses the same tags, SQL, and timestamps through the API journal.
  assert.deepEqual(journal,JSON.parse(fs.readFileSync('../apps/api/drizzle/meta/_journal.json')));
  for(const tag of ['0025_tracks_key_bpm','0034_tracks_acoustid_fingerprint'])
   assert.equal(fs.readFileSync(`drizzle/${tag}.sql`,'utf8'),fs.readFileSync(`../apps/api/drizzle/${tag}.sql`,'utf8'));
 }finally{
  if(pool)await pool.end();
  if(created)await admin.query(`DROP DATABASE "${name}"`);
  await admin.end();fs.rmSync(directory,{recursive:true,force:true});
 }
});
