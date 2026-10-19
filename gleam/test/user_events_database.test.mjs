import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { createTables } from './helpers/postgres.mjs';
import { handle } from '../build/dev/javascript/rocksky_api/rocksky_api/subscribers/user.mjs';
import { Ok, Error as GError } from '../build/dev/javascript/rocksky_api/gleam.mjs';

test('user indexing accepts object and array events with database or API IDs',
 {skip: !process.env.GLEAM_TEST_DATABASE_URL}, async () => {
  const client = new pg.Client({connectionString:process.env.GLEAM_TEST_DATABASE_URL});
  await client.connect();
  try {
   await createTables(client, ['users']);
   await client.query("INSERT INTO users (xata_id,did,handle,display_name,avatar) VALUES ('u','did:u','u.test','User',''), ('v','did:v','v.test','Other','')");
   const imports=[];
   let queries=0;
   const ctx={db:{pool:{query:(...args)=>{queries++; return client.query(...args);}}},typesense:{collections:name=>({documents:()=>({import:async docs=>{assert.equal(name,'users');imports.push(docs);return docs.map(()=>({success:true}));}})})}};
   for (const payload of [{xata_id:'u'}, {id:'u'}, [{id:'u'}], [{xata_id:'u'}, {id:'v'}, {id:'u'}]]) {
    const result=await handle(ctx,JSON.stringify(payload));
    assert.ok(result instanceof Ok,JSON.stringify(result));
    assert.deepEqual(imports.at(-1).map(row=>row.id).sort(),Array.isArray(payload)&&payload.length>1?['u','v']:['u']);
   }
   const before=queries;
   assert.ok(await handle(ctx,'[]') instanceof Ok);
   assert.equal(queries,before);
   assert.ok(await handle(ctx,'{"handle":"invalid"}') instanceof GError);
   assert.equal(queries,before);
  } finally {await client.end();}
 });
