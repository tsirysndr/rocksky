import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Hono} from 'hono';
import {PgDialect} from 'drizzle-orm/pg-core';
import {getTableName} from 'drizzle-orm';
import jwt from 'jsonwebtoken';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='users-shouts-test';process.env.JWT_SECRET='shouts-secret';
const R=await import('../output/Rocksky.Users.ShoutReads/index.js'),M=await import('../output/Rocksky.Users.Moderation/index.js');const {toAffE}=await import('../output/Control.Promise/index.js');const {Just}=await import('../output/Data.Maybe/index.js');const aff=f=>toAffE(()=>Promise.resolve().then(f));const dialect=new PgDialect(),user={id:'caller',did:'did:plc:caller'},authorization='Bearer '+jwt.sign({did:user.did},process.env.JWT_SECRET);
function setup(answers=[]){const queries=[],events=[],metrics=[],posts=[];function query(kind,fields,table){const call={kind,fields,table:table&&getTableName(table)};queries.push(call);const q={from(t){call.table=getTableName(t);return q},leftJoin(){return q},where(w){call.where=dialect.sqlToQuery(w);return q},orderBy(...xs){call.order=xs.map(x=>dialect.sqlToQuery(x).sql);return q},groupBy(...xs){call.groups=xs;return q},limit(){return q},values(v){call.values=v;return q},returning(){return q},async execute(){events.push(kind);if(kind==='delete')return [];assert.ok(answers.length,'unexpected query');return answers.shift()}};return q}const db={select:fields=>query('select',fields),insert:t=>query('insert',null,t),delete:t=>query('delete',null,t)};const analytics={async request({url,data}){posts.push({url,data});return {data:{scrobbles:1,artists:2,loved_tracks:3,albums:4,tracks:5,extra:6}}}};const ctx={db,analytics,metrics:{requestCounter:{add(_n,t){metrics.push(t)}}}};const app=new Hono();app.onError(e=>{return new Response(String(e),{status:500})});R.register(ctx)(app)();M.registerWith(ctx)({actor:{agent:did=>aff(()=>{events.push('agent:'+did);return new Just({})})},deleteRecord:a=>uri=>aff(()=>events.push('record:'+uri))})(app)();return {app,queries,events,metrics,posts}}
for(const kind of ['artist','album','song','scrobble']){
 const m=setup([[{shouts:{id:'s',gifUrl:'gif',facets:[]}}]]);const r=await m.app.request(`/did/app.rocksky.${kind}/k/shouts`);assert.equal(r.status,200);assert.equal((await r.json())[0].shouts.gifUrl,'gif');const q=m.queries[0];assert.deepEqual(q.where.params,[`at://did/app.rocksky.${kind}/k`]);assert.ok(!('liked' in q.fields.shouts));assert.ok('facets' in q.fields.shouts);assert.match(q.order[0],/desc/);assert.equal(q.groups.length,16);
 const a=setup([[user],[]]);assert.equal((await a.app.request(`/did/app.rocksky.${kind}/k/shouts`,{headers:{authorization}})).status,200);assert.deepEqual(dialect.sqlToQuery(a.queries[1].fields.shouts.liked.sql).params,['caller']);assert.ok(!('reported' in a.queries[1].fields.shouts));
}
{
 const m=setup([[user],[]]);assert.equal((await m.app.request('/handle/shouts',{headers:{authorization}})).status,200);const q=m.queries[1];assert.deepEqual(q.where.params,['handle','handle']);assert.ok(q.fields.shouts.reported);assert.equal(q.fields.users.id.table[Symbol.for('drizzle:Name')],'authors');assert.match(q.order[0],/profile_shouts/);
 const bad=setup();assert.equal((await bad.app.request('/handle/shouts',{headers:{authorization:'Bearer invalid'}})).status,500);assert.equal(bad.queries.length,0);
 const absent=setup([[],[]]);await absent.app.request('/handle/shouts',{headers:{authorization}});assert.ok(!('liked' in absent.queries[1].fields.shouts));
}
{
 const m=setup([[{raw:'like'}],[{raw:'reply'}]]);assert.deepEqual(await (await m.app.request('/did/app.rocksky.shout/k/likes')).json(),[{raw:'like'}]);assert.deepEqual(await (await m.app.request('/did/app.rocksky.shout/k/replies')).json(),[{raw:'reply'}]);assert.deepEqual(m.queries[1].where.params,['at://did/app.rocksky.shout/k']);assert.match(m.queries[1].order[0],/asc/);assert.deepEqual(await (await m.app.request('/handle/stats')).json(),{scrobbles:1,artists:2,lovedTracks:3,albums:4,tracks:5});assert.deepEqual(m.posts,[{url:'library.getStats',data:{user_did:'handle'}}]);
}
const path='/did/app.rocksky.shout/k',shout={id:'s',authorId:'caller',uri:'at://did/app.rocksky.shout/k',content:'preserved'},report={id:'report',userId:'caller',shoutId:'s'};
const request=(m,method,suffix='')=>m.app.request(path+suffix,{method,headers:{authorization}});
for(const [method,suffix] of [['POST','/report'],['DELETE','/report'],['DELETE','']]){const m=setup();assert.equal((await m.app.request(path+suffix,{method})).status,401);assert.equal(m.queries.length,0)}
{
 const m=setup([[shout],[user],[report]]);assert.deepEqual(await (await request(m,'POST','/report')).json(),report);assert.equal(m.queries.length,3);
 const fresh=setup([[shout],[user],[],[report]]);assert.deepEqual(await (await request(fresh,'POST','/report')).json(),report);assert.deepEqual(fresh.queries[3].values,[{userId:'caller',shoutId:'s'}]);
 const del=setup([[shout],[user],[report]]);assert.deepEqual(await (await request(del,'DELETE','/report')).json(),report);assert.deepEqual(del.queries[3].where.params,['report']);
 for(const [answers,status] of [[[[],[]],404],[[[shout],[]],401],[[[shout],[user],[]],404],[[[shout],[user],[{...report,userId:'other'}]],403]]){const m=setup(answers);assert.equal((await request(m,'DELETE','/report')).status,status)}
}
{
 const m=setup([[user],[shout],[{replies:{id:'r1'}},{replies:{id:'r2'}}]]);assert.deepEqual(await (await request(m,'DELETE')).json(),shout);assert.deepEqual(m.events,['agent:did:plc:caller','select','select','select',...Array(8).fill('delete'),'record:'+shout.uri]);const deletes=m.queries.filter(q=>q.kind==='delete');assert.deepEqual(deletes.map(q=>q.table),['shout_likes','shout_reports','profile_shouts','profile_shouts','shout_likes','shout_reports','shouts','shouts']);assert.deepEqual(deletes.map(q=>q.where.params),[['r1','r2'],['r1','r2'],['s'],['r1','r2'],['s'],['s'],['r1','r2'],['s']]);assert.deepEqual(m.queries[2].where.params,['s']);
 for(const [answers,status] of [[[[]],401],[[[user],[]],404],[[[user],[{...shout,authorId:'other'}]],403]]){const m=setup(answers);assert.equal((await request(m,'DELETE')).status,status);assert.equal(m.queries.filter(q=>q.kind==='delete').length,0)}
}
console.log('Users shout reads/stats/moderation: projections, optional auth, aliases, reports, ownership and ordered deletion passed');
