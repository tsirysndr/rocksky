import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { setImmediate as turn } from 'node:timers/promises';
import { createTables } from './helpers/postgres.mjs';
import { Ok } from '../build/dev/javascript/rocksky_api/gleam.mjs';
import { notify, notify_shout } from '../build/dev/javascript/rocksky_api/rocksky_api/notifications/song_activity.mjs';
import { app } from '../build/dev/javascript/rocksky_api/rocksky_api/notifications/sse.mjs';
import { list_notifications } from '../build/dev/javascript/rocksky_api/rocksky_api/notifications/service.mjs';
import { None, Some } from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';

test('song likes notify owner and lovers once, exclude passive listeners and actor, and update every live tab',
 { skip: !process.env.GLEAM_TEST_DATABASE_URL }, async t => {
  const client=new pg.Client({connectionString:process.env.GLEAM_TEST_DATABASE_URL});await client.connect();
  try {
   await createTables(client,['users','tracks','albums','scrobbles','user_tracks','loved_tracks','notifications','shouts']);
   await client.query("INSERT INTO users(xata_id,did,handle,display_name,avatar) VALUES ('actor','did:actor','actor.test','Actor',''),('owner','did:owner','owner.test','Owner',''),('lover','did:lover','lover.test','Lover',''),('listener','did:listener','listener.test','Listener',''),('other','did:other','other.test','Other','')");
   await client.query("INSERT INTO users(xata_id,did,handle,display_name,avatar) SELECT 'bulk-'||i,'did:bulk-'||i,'bulk-'||i||'.test','Bulk','' FROM generate_series(1,205) AS i");
   const uri='at://did:owner/app.rocksky.song/song';
   await client.query("INSERT INTO tracks(xata_id,title,artist,album,album_artist,duration,sha256,uri) VALUES ('song','Song','Artist','Album','Artist',100,'song',$1),('other-song','Other','Artist','Album','Artist',100,'other-song','at://did:other/app.rocksky.song/other')",[uri]);
   await client.query("INSERT INTO loved_tracks(user_id,track_id) VALUES ('actor','song'),('owner','song'),('lover','song'),('lover','song'),('other','other-song'); INSERT INTO loved_tracks(user_id,track_id) SELECT 'bulk-'||i,'song' FROM generate_series(1,205) AS i");
   await client.query("INSERT INTO scrobbles(user_id,track_id) VALUES ('listener','song'); INSERT INTO user_tracks(user_id,track_id) VALUES ('listener','song')");
   const published=[],subscriptions=new Map(),queries=[];
   const nc={subscribe(subject){
    const waiting=[],queue=[];let closed=false;
    const sub={push(value){if(closed)return;const next=waiting.shift();if(next)next({done:false,value});else queue.push(value);},unsubscribe(){closed=true;for(const next of waiting)next({done:true});subscriptions.get(subject).delete(sub);},[Symbol.asyncIterator](){return {next:()=>closed?Promise.resolve({done:true}):queue.length?Promise.resolve({done:false,value:queue.shift()}):new Promise(resolve=>waiting.push(resolve))};}};
    if(!subscriptions.has(subject))subscriptions.set(subject,new Set());subscriptions.get(subject).add(sub);return sub;
   },publish(subject,data){published.push({subject,data:JSON.parse(Buffer.from(data).toString())});for(const sub of subscriptions.get(subject)||[])sub.push({data});}};
   const ctx={db:{pool:{query:(...args)=>{queries.push(typeof args[0]==='string'?args[0]:args[0].text);return client.query(...args);}}},env:{jwt_secret:'test'},nc};
   t.mock.timers.enable({apis:['setTimeout']});
   const api=app(ctx),token=jwt.sign({did:'did:lover'},'test');
   const streams=await Promise.all([api.request('/stream?token='+token),api.request('/stream?token='+token)]);
   const readers=streams.map(response=>response.body.getReader()),text=new TextDecoder();
   for(const reader of readers)assert.match(text.decode((await reader.read()).value),/event: unread\ndata: {"unreadCount":0}/);
   await turn();queries.length=0;
   const created=await notify(ctx,'song',uri,'actor');assert.ok(created instanceof Ok,JSON.stringify(created));
   assert.equal(created[0].toArray().length,207);
   assert.equal(queries.filter(sql=>sql.startsWith('insert into "notifications"')).length,2);
   assert.ok(queries.length<=12,'Fanout must use batches rather than per-recipient SQL');
   const recipients=published.map(event=>event.subject);
   assert.equal(recipients.length,207);assert.equal(new Set(recipients).size,207);
   assert.ok(recipients.includes('rocksky.notification.owner'));assert.ok(recipients.includes('rocksky.notification.lover'));
   for(const id of ['actor','listener','other'])assert.ok(!recipients.includes('rocksky.notification.'+id));
   for(const event of published){assert.equal(event.data.type,'notification');assert.equal(event.data.unreadCount,1);assert.equal(event.data.notification.actor.handle,'actor.test');assert.equal(event.data.notification.subject.title,'Song');}
   for(const reader of readers){const frame=text.decode((await reader.read()).value);assert.match(frame,/event: notification/);assert.match(frame,/"unreadCount":1/);}
   const page=await list_notifications(ctx,'lover',30,new None());assert.ok(page instanceof Ok);assert.equal(page[0][0].toArray().length,1);
   await client.query("INSERT INTO users(xata_id,did,handle,display_name,avatar) VALUES ('participant','did:participant','participant.test','Participant',''); INSERT INTO shouts(xata_id,author_id,track_id,content,uri) VALUES ('earlier','participant','song','Earlier','at://did:participant/app.rocksky.shout/earlier'),('duplicate','participant','song','Another','at://did:participant/app.rocksky.shout/another'),('new','actor','song','New shout','at://did:actor/app.rocksky.shout/new'),('unrelated','other','other-song','Other','at://did:other/app.rocksky.shout/other')");
   published.length=0;queries.length=0;
   assert.ok((await notify_shout(ctx,'song',uri,'actor','new',new Some('participant'))) instanceof Ok);
   assert.equal(published.length,208);assert.equal(new Set(published.map(e=>e.subject)).size,208);
   for(const event of published){
    assert.equal(event.data.notification.shoutContent,'New shout');
    if(event.subject==='rocksky.notification.participant'){assert.equal(event.data.notification.type,'reply');assert.equal(event.data.unreadCount,1);}
    else{assert.equal(event.data.notification.type,'comment_scrobble');assert.equal(event.data.unreadCount,2);}
   }
   for(const id of ['actor','listener','other'])assert.ok(!published.some(e=>e.subject==='rocksky.notification.'+id));
   assert.ok(queries.length<=20,'Shout fanout must batch database operations');
   for(const reader of readers){const frame=text.decode((await reader.read()).value);assert.match(frame,/event: notification/);assert.match(frame,/"unreadCount":2/);}
   for(const reader of readers)await reader.cancel();await turn();t.mock.timers.tick(25000);await turn();
   assert.equal(subscriptions.get('rocksky.notification.lover').size,0);
   t.mock.timers.reset();
  } finally {await client.end();}
 });
