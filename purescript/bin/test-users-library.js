import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Hono} from 'hono';
import {PgDialect} from 'drizzle-orm/pg-core';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='users-library-test';
const L=await import('../output/Rocksky.Users.Library/index.js');const dialect=new PgDialect();
function setup(answers=[]){const queries=[],metrics=[],posts=[];const db={select(fields){const call={fields};queries.push(call);const q={from(){return q},leftJoin(){return q},where(w){call.where=dialect.sqlToQuery(w);return q},orderBy(...o){call.order=o.map(x=>dialect.sqlToQuery(x).sql);return q},limit(n){call.limit=n;return q},offset(n){call.offset=n;return q},async execute(){assert.ok(answers.length);return answers.shift()}};return q}};const analytics={async request({url:method,data:payload}){posts.push({method,payload});return {data:[{id:'a',tags:['old']}]}}};const app=new Hono();L.register({db,analytics,metrics:{requestCounter:{add(n,tags){metrics.push({n,tags})}}}})(app)();return {app,queries,metrics,posts}}
{
 const m=setup();for(const [route,method] of [['scrobbles','library.getScrobbles'],['albums','library.getTopAlbums'],['artists','library.getTopArtists'],['tracks','library.getTopTracks']]){const r=await m.app.request('/handle.test/'+route+'?size=2.5&offset=-3');assert.equal(r.status,200);assert.deepEqual(await r.json(),[{id:'a',tags:route==='scrobbles'?['old']:[]}]);assert.deepEqual(m.posts.at(-1),{method,payload:{user_did:'handle.test',pagination:{skip:-3,take:2.5}}});assert.equal(m.metrics.at(-1).tags.route,route==='scrobbles'?'/users/:handle/scrobbles':'/users/:did/'+route)}
 await m.app.request('/did/tracks?size=0&offset=bad');assert.deepEqual(m.posts.at(-1).payload.pagination,{skip:0,take:10});
}
{
 const m=setup([[{loved_tracks:{id:'like'},tracks:{id:'song'},users:{id:'user'}}],[{playlists:{id:'p',name:'Playlist'},trackCount:'12'}]]);const likes=await m.app.request('/handle/likes?size=4&offset=2');assert.deepEqual(await likes.json(),[{loved_tracks:{id:'like'},tracks:{id:'song'},users:{id:'user'}}]);assert.deepEqual(m.queries[0].where.params,['handle','handle']);assert.equal(m.queries[0].limit,4);assert.equal(m.queries[0].offset,2);const playlists=await m.app.request('/handle/playlists');assert.deepEqual(await playlists.json(),[{id:'p',name:'Playlist',trackCount:12}]);
}
{
 const m=setup([[{tracks:{id:'t',title:'Track'},artist_tracks:{xataVersion:7}}],[{albums:{id:'a',title:'Album'},artist_albums:{xataVersion:8}},{albums:{id:'a',title:'Duplicate'},artist_albums:{xataVersion:2}}]]);const tracks=await m.app.request('/did:plc:x/app.rocksky.artist/key/tracks');assert.deepEqual(await tracks.json(),[{id:'t',title:'Track',xata_version:7}]);assert.deepEqual(m.queries[0].where.params,['at://did:plc:x/app.rocksky.artist/key']);const albums=await m.app.request('/did:plc:x/app.rocksky.artist/key/albums');assert.deepEqual(await albums.json(),[{id:'a',title:'Album',xata_version:8}]);assert.equal(m.metrics.length,2);
}
console.log('Users library: analytics routes/tags/pagination, metrics, raw likes, playlist counts, source URI comparisons and artist album dedup passed');
