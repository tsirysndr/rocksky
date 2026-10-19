// Run after spago build with TEST_DATABASE_URL pointing at a local test database.
// Fixtures are connection-local temp tables; application data is never changed.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { getTableColumns, getTableName, SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

if (!process.env.TEST_DATABASE_URL) {
  console.log('Skipped notification fanout integration: set TEST_DATABASE_URL');
  process.exit(0);
}
process.env.NODE_ENV='test';
const envSource=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');
for(const [,name] of envSource.matchAll(/"([A-Z0-9_]+)": str required/g)) process.env[name]??='service-test';
const {fromAff}=await import('../output/Control.Promise/index.js');
const {Just}=await import('../output/Data.Maybe/index.js');
const activity=await import('../output/Rocksky.Notifications.SongActivity/index.js');
const T=await import('../output/Rocksky.Schema/index.js');
const run=aff=>fromAff(aff)();
const client=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});
await client.connect();
try {
  const quote=x=>'"'+x.replaceAll('"','""')+'"';
  const dialect=new PgDialect();
  await client.query("CREATE FUNCTION pg_temp.xata_id() RETURNS text LANGUAGE SQL AS 'SELECT md5(random()::text)'; SET search_path=pg_temp,public");
  for(const table of [T.users,T.tracks,T.albums,T.scrobbles,T.userTracks,T.lovedTracks,T.shouts,T.notifications]){
    const cols=Object.values(getTableColumns(table)).map(c=>{
      let sql=`${quote(c.name)} ${c.getSQLType()}${c.primary?' PRIMARY KEY':''}${c.notNull?' NOT NULL':''}`;
      if(c.default!==undefined){
        let value=c.default instanceof SQL?dialect.sqlToQuery(c.default).sql.replaceAll('xata_id()', 'md5(random()::text)'):typeof c.default==='string'?"'"+c.default.replaceAll("'","''")+"'":String(c.default);
        sql+=' DEFAULT '+value;
      }
      return sql;
    });
    await client.query(`CREATE TEMP TABLE ${quote(getTableName(table))} (${cols.join(',')})`);
  }
  await client.query("INSERT INTO users(xata_id,did,handle,display_name,avatar) VALUES ('actor','did:actor','actor.test','Actor',''),('owner','did:owner','owner.test','Owner',''),('lover','did:lover','lover.test','Lover',''),('participant','did:participant','participant.test','Participant',''),('passive','did:passive','passive.test','Passive',''),('other','did:other','other.test','Other',''); INSERT INTO users(xata_id,did,handle,display_name,avatar) SELECT 'bulk-'||i,'did:bulk-'||i,'bulk-'||i||'.test','Bulk','' FROM generate_series(1,205) AS i");
  const uri='at://did:owner/app.rocksky.song/song';
  await client.query("INSERT INTO tracks(xata_id,title,artist,album,album_artist,duration,sha256,uri) VALUES ('song','Song','Artist','Album','Artist',100,'song',$1),('other-song','Other','Artist','Album','Artist',100,'other','at://did:other/app.rocksky.song/other')",[uri]);
  await client.query("INSERT INTO loved_tracks(user_id,track_id) VALUES ('actor','song'),('owner','song'),('lover','song'),('lover','song'),('other','other-song'); INSERT INTO loved_tracks(user_id,track_id) SELECT 'bulk-'||i,'song' FROM generate_series(1,205) AS i; INSERT INTO scrobbles(user_id,track_id) VALUES ('passive','song'); INSERT INTO user_tracks(user_id,track_id) VALUES ('passive','song'); INSERT INTO shouts(xata_id,author_id,track_id,content,uri) VALUES ('earlier','participant','song','Earlier','at://did:participant/app.rocksky.shout/earlier'),('duplicate','participant','song','Another','at://did:participant/app.rocksky.shout/another'),('new','actor','song','New shout','at://did:actor/app.rocksky.shout/new'),('unrelated','other','other-song','Other song','at://did:other/app.rocksky.shout/other')");
  const events=[],queries=[];
  const ctx={db:drizzle(client,{logger:{logQuery(sql){queries.push(sql);}}}),nc:{publish(subject,data){events.push({subject,data:JSON.parse(Buffer.from(data).toString())});}}};
  await run(activity.notifySongLike(ctx)('song')(uri)('actor'));
  assert.equal(events.length,207);
  assert.equal(new Set(events.map(e=>e.subject)).size,207);
  assert.ok(!events.some(e=>['participant','passive','actor','other'].some(id=>e.subject==='rocksky.notification.'+id)));
  assert.equal(queries.filter(q=>q.startsWith('insert into "notifications"')).length,2);
  assert.ok(queries.length<=12);
  events.length=0;queries.length=0;
  await run(activity.notifySongShout(ctx)('song')(uri)('actor')('new')(new Just('participant')));
  assert.equal(events.length,208);
  assert.equal(new Set(events.map(e=>e.subject)).size,208);
  for(const e of events){
    assert.equal(e.data.notification.shoutContent,'New shout');
    if(e.subject==='rocksky.notification.participant'){
      assert.equal(e.data.notification.type,'reply');assert.equal(e.data.unreadCount,1);
    }else{
      assert.equal(e.data.notification.type,'comment_scrobble');assert.equal(e.data.unreadCount,2);
    }
  }
  for(const id of ['actor','passive','other'])assert.ok(!events.some(e=>e.subject==='rocksky.notification.'+id));
  assert.ok(queries.length<=20,'Shouts must batch counts, hydration and inserts');
  console.log('Verified PureScript song-like and shout audiences, batching, deduplication, reply types and realtime unread counts.');
}finally{await client.end();}
