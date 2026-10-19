import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { createTables } from './helpers/postgres.mjs';
import { Ok, toList } from '../build/dev/javascript/rocksky_api/gleam.mjs';
import { Some, None } from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';
import { Input } from '../build/dev/javascript/rocksky_api/rocksky_api/shouts/input.mjs';
import { ShoutMention, ShoutGif } from '../build/dev/javascript/rocksky_api/rocksky_api/lexicon/models.mjs';
import * as service from '../build/dev/javascript/rocksky_api/rocksky_api/shouts/service.mjs';

const cid='bafyreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku';
const did='did:plc:abcdefghijklmnopqrstuvwx';
const owner='did:plc:zyxwvutsrqponmlkjihgfedcb';
const subject=`at://${owner}/app.rocksky.song/song`;
test('Shout writes validate records, thread replies, notify mentions once, and enforce deletion ownership', {skip:!process.env.GLEAM_TEST_PGHOST}, async()=>{
  const pool=new pg.Pool({host:process.env.GLEAM_TEST_PGHOST,port:Number(process.env.GLEAM_TEST_PGPORT),database:'postgres',max:1});
  const original=globalThis.fetch;
  try {
    await createTables(pool,['users','tracks','albums','artists','scrobbles','shouts','shout_likes','shout_reports','profile_shouts','notifications','loved_tracks']);
    await pool.query(`INSERT INTO users (xata_id,did,handle,display_name,avatar) VALUES ('u',$1,'u.test','User',''),('v',$2,'v.test','Other','')`,[did,owner]);
    await pool.query("INSERT INTO tracks (xata_id,title,artist,album_artist,album,duration,sha256,uri) VALUES ('t','Song','Artist','Artist','Album',100,'hash',$1)",[subject]);
    await pool.query("INSERT INTO users (xata_id,did,handle,display_name,avatar) VALUES ('lover','did:plc:aaaaaaaaaaaaaaaaaaaaaaaa','lover.test','Lover',''),('participant','did:plc:bbbbbbbbbbbbbbbbbbbbbbbb','participant.test','Participant',''),('passive','did:plc:cccccccccccccccccccccccc','passive.test','Passive','')");
    await pool.query("INSERT INTO loved_tracks (user_id,track_id) VALUES ('lover','t'),('lover','t'),('v','t'),('u','t'); INSERT INTO scrobbles(user_id,track_id) VALUES ('passive','t'); INSERT INTO shouts(xata_id,author_id,track_id,content,uri) VALUES ('earlier','participant','t','Earlier','at://did:plc:bbbbbbbbbbbbbbbbbbbbbbbb/app.rocksky.shout/earlier')");
    const events=[];
    const ctx={db:{pool},read_db:{pool},env:{plc_directory_url:'https://plc.test'},nc:{publish:(subject,data)=>events.push({subject,data:JSON.parse(Buffer.from(data).toString())})}};
    const writes=[],deletes=[];
    const mock={did,com:{atproto:{repo:{
      getRecord:async p=>({data:{uri:p.collection==='app.bsky.actor.profile'?`at://${did}/${p.collection}/self`:subject,cid,value:{}}}),
      createRecord:async p=>{writes.push(p);return {data:{uri:`at://${did}/${p.collection}/${p.rkey}`,cid}};},
      deleteRecord:async p=>{deletes.push(p);return {data:{}};}
    }}}};
    globalThis.fetch=async raw=>{
      const url=new URL(typeof raw==='string'?raw:raw.url??raw);
      if(url.host==='plc.test')return Response.json({service:[{serviceEndpoint:'https://pds.test'}]});
      assert.equal(url.host,'pds.test');assert.equal(url.pathname,'/xrpc/com.atproto.repo.getRecord');
      return Response.json({uri:`at://${url.searchParams.get('repo')}/${url.searchParams.get('collection')}/${url.searchParams.get('rkey')}`,cid,value:{}});
    };
    const input=new Input(new Some('Hello @other'),new None(),toList([new ShoutMention(owner,6,12),new ShoutMention(owner,6,12)]));
    const check=r=>assert.ok(r instanceof Ok,JSON.stringify(r));
    check(await service.create(ctx,input,subject,'u',mock));
    const shout=(await pool.query("SELECT * FROM shouts WHERE author_id='u'")).rows[0];assert.equal(shout.track_id,'t');
    assert.equal(writes[0].validate,false);assert.equal(writes[0].record.subject.uri,subject);
    assert.deepEqual((await pool.query('SELECT user_id,type FROM notifications ORDER BY user_id')).rows,[{user_id:'lover',type:'comment_scrobble'},{user_id:'participant',type:'comment_scrobble'},{user_id:'v',type:'comment_scrobble'}]);
    assert.equal(events.length,3);assert.ok(events.every(e=>e.data.notification.shoutContent==='Hello @other'));
    events.length=0;
    check(await service.reply(ctx,input,shout.xata_id,'u',mock));
    assert.equal(events.length,3);assert.ok(events.every(e=>e.data.unreadCount===2));
    assert.equal(writes[1].record.parent.uri,shout.uri);assert.equal(writes[1].record.subject.uri,subject);
    check(await service.like(ctx,shout.uri,'v',mock));check(await service.like(ctx,shout.uri,'v',mock));
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM shout_likes')).rows[0].n,1);
    check(await service.unlike(ctx,shout.uri,'v',mock));assert.equal((await pool.query('SELECT count(*)::int AS n FROM shout_likes')).rows[0].n,0);
    assert.ok(!((await service.remove(ctx,shout.xata_id,'v',mock)) instanceof Ok));
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM shouts')).rows[0].n,3);
    check(await service.remove(ctx,shout.xata_id,'u',mock));assert.equal((await pool.query('SELECT count(*)::int AS n FROM shouts')).rows[0].n,1);
    const gif=new Input(new None(),new Some(new ShoutGif('https://gif.test/a',new None(),new None(),new Some(2),new Some(2))),toList([]));
    check(await service.create(ctx,gif,'v.test','u',mock));
    assert.equal((await pool.query('SELECT user_id FROM profile_shouts')).rows[0].user_id,'v');
    const before=writes.length;
    assert.ok(!((await service.create(ctx,new Input(new Some('  '),new None(),toList([])),subject,'u',mock)) instanceof Ok));
    assert.equal(writes.length,before);
  } finally {globalThis.fetch=original;await pool.end();}
});
