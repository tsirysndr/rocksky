import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { createTables } from './helpers/postgres.mjs';
import { Ok, Error as GError } from '../build/dev/javascript/rocksky_api/gleam.mjs';
import { Some, None } from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';
import { put } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/event/put_rsvp.mjs';
import { PutRsvpInput } from '../build/dev/javascript/rocksky_api/rocksky_api/lexicon/models.mjs';
import { Unauthorized, InvalidRequest } from '../build/dev/javascript/rocksky_api/rocksky_api/error.mjs';

test('RSVP writes preserve duplicate subjects and roll back rejected PDS writes', {skip:!process.env.GLEAM_TEST_PGHOST}, async()=>{
  const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
  try {
    await createTables(pool,['users','events','event_rsvps']);
    await pool.query(`
      CREATE UNIQUE INDEX ON event_rsvps(event_id,user_id);
      INSERT INTO users (xata_id,did,handle,display_name,avatar) VALUES ('u','did:test:u','u.test','User','avatar'),('v','did:test:v','v.test','Visitor','');
      INSERT INTO events (xata_id,uri,music_uri,name,created_by,cid) VALUES
        ('e','at://did:test:u/community.lexicon.calendar.event/e','at://music','Main','u','event-cid'),
        ('dup','at://did:test:u/community.lexicon.calendar.event/dup','at://music-dup','Duplicate','u',NULL);
      UPDATE events SET duplicate_of='e' WHERE xata_id='dup';
      INSERT INTO event_rsvps (event_id,user_id,uri,status) VALUES ('dup','u','at://did:test:u/community.lexicon.calendar.rsvp/old','community.lexicon.calendar.rsvp#going');
    `);
    const ctx={db:{pool},read_db:{pool}}; const writes=[]; let reject=false;
    const mock={com:{atproto:{repo:{
      getRecord:async p=>{ assert.equal(p.rkey,'dup'); return {data:{uri:'at://dup',cid:'duplicate-cid',value:{}}}; },
      putRecord:async p=>{ if(reject) throw Object.assign(new Error('denied'),{status:403}); writes.push(p); return {data:{uri:`at://${p.repo}/${p.collection}/${p.rkey}`,cid:'rsvp-cid'}}; }
    }}}};
    const factory=async()=>new Ok(new Some(mock));
    const uri='at://u.test/community.lexicon.calendar.event/e';
    const interested='community.lexicon.calendar.rsvp#interested';
    const call=(did,status=interested,f=factory)=>put(ctx,new PutRsvpInput(uri,status),did?new Some(did):new None(),f);
    assert.ok((await call(null))[0] instanceof Unauthorized);
    assert.ok((await call('did:test:u','invalid'))[0] instanceof InvalidRequest);
    assert.ok((await call('did:test:unknown'))[0] instanceof Unauthorized);
    assert.ok((await call('did:test:u',interested,async()=>new Ok(new None())))[0] instanceof Unauthorized);
    const result=await call('did:test:u'); assert.ok(result instanceof Ok); assert.equal(result[0].status,interested);
    assert.equal(writes[0].rkey,'old'); assert.equal(writes[0].record.subject.uri,'at://did:test:u/community.lexicon.calendar.event/dup');
    assert.equal(writes[0].record.subject.cid,'duplicate-cid'); assert.equal(writes[0].validate,false);
    assert.deepEqual((await pool.query('SELECT event_id,status FROM event_rsvps')).rows,[{event_id:'dup',status:interested}]);
    reject=true;
    assert.ok((await call('did:test:u','community.lexicon.calendar.rsvp#notgoing'))[0] instanceof Unauthorized);
    assert.equal((await pool.query('SELECT status FROM event_rsvps')).rows[0].status,interested);
    reject=false;
    const fresh=await call('did:test:v'); assert.ok(fresh instanceof Ok); assert.notEqual(writes[1].rkey,'old');
    assert.equal(writes[1].record.subject.cid,'event-cid');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM event_rsvps')).rows[0].n,2);
  } finally { await pool.end(); }
});
