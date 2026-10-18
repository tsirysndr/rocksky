import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Hono} from 'hono';
import jwt from 'jsonwebtoken';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='users-profile-test';process.env.JWT_SECRET='profile-secret';
const P=await import('../output/Rocksky.Users.Profile/index.js');const {toAffE}=await import('../output/Control.Promise/index.js');const {Just,Nothing}=await import('../output/Data.Maybe/index.js');const aff=f=>toAffE(()=>Promise.resolve().then(f));const authorization='Bearer '+jwt.sign({did:'did:plc:caller'},process.env.JWT_SECRET);
function setup(answers,profile={displayName:Nothing.value,avatar:Nothing.value},handle='updated.test'){const writes=[],events=[],published=[];const db={select(){const q={from(){return q},where(){return q},limit(){return q},async execute(){events.push('select');assert.ok(answers.length);return answers.shift()}};return q},update(){const q={set(v){writes.push(v);return q},where(){return q},async execute(){events.push('update')}};return q}};const ops={agent:did=>aff(()=>{events.push('agent:'+did);return new Just({})}),handle:did=>aff(()=>{events.push('handle:'+did);return handle}),profile:did=>()=>aff(()=>{events.push('profile:'+did);return profile}),publish:value=>()=>{events.push('publish');published.push(value)}};const app=new Hono();app.onError(()=>new Response('error',{status:500}));P.registerWith({db,metrics:{requestCounter:{add(){}}}})(ops)(app)();return {app,writes,events,published}}
{
 const m=setup([[{id:'u',avatar:'keep',displayName:'keep'}]]);const r=await m.app.request('/handle');assert.equal(r.status,200);assert.equal(m.writes.length,0);assert.deepEqual(m.events,['select']);
 const missing=setup([[]]);assert.equal((await missing.app.request('/missing')).status,404);
}
{
 const user={id:'u',did:'did:plc:target',handle:'updated.test',avatar:'kept'};const m=setup([[user],[user]],{displayName:new Just(''),avatar:Nothing.value});const r=await m.app.request('/did:plc:target',{headers:{authorization}});assert.equal(r.status,200);assert.deepEqual(m.writes,[{handle:'updated.test',displayName:''}]);assert.deepEqual(m.published,[user]);assert.deepEqual(m.events,['agent:did:plc:caller','handle:did:plc:target','profile:did:plc:target','update','select','publish','select']);
}
{
 const m=setup([[{id:'u'}]],{displayName:new Just('Ignored'),avatar:new Just('Ignored')},'');assert.equal((await m.app.request('/target',{headers:{authorization}})).status,200);assert.equal(m.writes.length,0);assert.equal(m.published.length,0);
 const invalid=setup([]);assert.equal((await invalid.app.request('/target',{headers:{authorization:'Bearer invalid'}})).status,500);assert.equal(invalid.events.length,0);
}
console.log('Users profile: anonymous reads, missing user, caller session/target resolution, sparse update, publication order and invalid-token propagation passed');
