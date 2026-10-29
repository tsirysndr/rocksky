import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { createTables } from './helpers/postgres.mjs';
import { app } from '../build/dev/javascript/rocksky_api/rocksky_api/notifications/push.mjs';

test('device routes authenticate, validate, reassign and remove only owned registrations', {skip:!process.env.GLEAM_TEST_PGHOST}, async () => {
  const pool = new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
  try {
    await createTables(pool,['users']);
    await pool.query("INSERT INTO users(xata_id,did,handle,display_name,avatar) VALUES ('u1','did:plc:one','one.test','One',''),('u2','did:plc:two','two.test','Two','')");
    const migration = await fs.readFile(new URL('../drizzle/0055_notification_devices.sql',import.meta.url),'utf8');
    await pool.query(migration.replace('CREATE TABLE IF NOT EXISTS','CREATE TEMP TABLE IF NOT EXISTS'));
    const server = app({db:{pool},env:{jwt_secret:'secret'}});
    const send = (path, did, body) => server.request(path,{method:'POST',headers:{'Content-Type':'application/json',...(did ? {Authorization:`Bearer ${jwt.sign({did},'secret')}`} : {})},body:JSON.stringify(body)});
    assert.equal((await send('/devices',null,{token:'device'})).status,401);
    for (const body of [{},{token:''},{token:123},{token:'x'.repeat(4097)}]) {
      assert.equal((await send('/devices','did:plc:one',body)).status,400);
    }
    assert.equal((await send('/devices','did:plc:one',{token:'device'})).status,200);
    assert.equal((await send('/devices','did:plc:two',{token:'device'})).status,200);
    assert.equal((await send('/devices/remove','did:plc:one',{token:'device'})).status,200);
    assert.deepEqual((await pool.query('SELECT token,user_id FROM notification_devices')).rows,[{token:'device',user_id:'u2'}]);
    assert.equal((await send('/devices/remove','did:plc:two',{token:'device'})).status,200);
    assert.equal((await pool.query('SELECT * FROM notification_devices')).rowCount,0);
  } finally { await pool.end(); }
});
