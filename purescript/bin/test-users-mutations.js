import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Hono} from 'hono';
import jwt from 'jsonwebtoken';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='users-mutations-test';process.env.JWT_SECRET='mutation-secret';
const M=await import('../output/Rocksky.Users.Mutations/index.js');const {toAffE}=await import('../output/Control.Promise/index.js');const {Just,Nothing}=await import('../output/Data.Maybe/index.js');const aff=f=>toAffE(()=>Promise.resolve().then(f));const user={id:'caller',did:'did:plc:caller'};const authorization='Bearer '+jwt.sign({did:user.did},process.env.JWT_SECRET);
const routes=[...['artist','album','song','scrobble'].map(k=>['POST',`/did:plc:target/app.rocksky.${k}/key/shouts`]),['POST','/target/shouts'],['POST','/did/app.rocksky.shout/key/likes'],['DELETE','/did/app.rocksky.shout/key/likes'],['POST','/did/app.rocksky.song/key/likes'],['DELETE','/did/app.rocksky.song/key/likes'],['POST','/tracks/id/likes'],['DELETE','/tracks/id/likes'],['POST','/did/app.rocksky.shout/key/replies']];
function setup(answers=[],missingAgent=false){const events=[],calls=[],metrics=[];const db={select(){const q={from(){return q},where(){return q},limit(){return q},async execute(){events.push('select');assert.ok(answers.length);return answers.shift()}};return q}};const record=(kind,args)=>{calls.push({kind,args});};const ops={agent:did=>aff(()=>{events.push('agent:'+did);return missingAgent?Nothing.value:new Just({session:true})}),create:s=>uri=>u=>a=>aff(()=>record('create',[s,uri,u,a])),reply:s=>uri=>u=>a=>aff(()=>record('reply',[s,uri,u,a])),likeShout:uri=>u=>a=>aff(()=>record('likeShout',[uri,u,a])),unlikeShout:uri=>u=>a=>aff(()=>record('unlikeShout',[uri,u,a])),likeTrack:t=>u=>a=>aff(()=>record('likeTrack',[t,u,a])),unlikeTrack:sha=>u=>a=>aff(()=>record('unlikeTrack',[sha,u,a]))};const app=new Hono();app.onError(()=>new Response('error',{status:500}));M.registerWith({db,metrics:{requestCounter:{add(_n,tags){metrics.push(tags)}}}})(ops)(app)();return {app,events,calls,metrics}}
const req=(app,method,path,body={message:'hello'})=>app.request(path,{method,headers:{authorization,'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})});
{
 const m=setup();for(const [method,path] of routes){const r=await m.app.request(path,{method});assert.equal(r.status,401);assert.equal(await r.text(),'Unauthorized')}assert.equal(m.events.length,0);assert.equal(m.metrics.length,12);
}
for(const kind of ['artist','album','song','scrobble']){
 const m=setup([[user]]);const r=await req(m.app,'POST',`/did:plc:target/app.rocksky.${kind}/key/shouts`,{message:' hello ',unknown:'stripped'});assert.equal(r.status,200);assert.deepEqual(await r.json(),{});assert.equal(m.calls[0].args[1],`at://did:plc:target/app.rocksky.${kind}/key`);assert.equal(m.calls[0].args[0].message.value0,' hello ');assert.deepEqual(m.events,['agent:did:plc:caller','select']);
}
{
 const m=setup([[user],[{did:'did:plc:resolved'}]]);assert.equal((await req(m.app,'POST','/target/shouts')).status,200);assert.equal(m.calls[0].args[1],'at://did:plc:resolved');
 const bad=setup([[user]]);const r=await req(bad.app,'POST','/target/shouts',{});assert.equal(r.status,400);assert.match(await r.text(),/^Invalid shout data:/);assert.equal(bad.calls.length,0);
 const missing=setup([[]]);assert.equal((await req(missing.app,'POST','/target/shouts')).status,401);assert.equal(missing.events[0],'agent:did:plc:caller');
}
{
 const track={title:'T',artist:'A',album:'B',albumArt:null,albumArtist:'A',trackNumber:1,duration:100,composer:null,lyrics:null,discNumber:1,sha256:'hash',mbId:'omit'};
 const m=setup([[user],[track]]);assert.equal((await req(m.app,'POST','/tracks/id/likes')).status,200);assert.equal(m.calls[0].kind,'likeTrack');assert.equal(m.calls[0].args[0].albumArt,null);assert.equal('sha256' in m.calls[0].args[0],false);assert.equal('mbId' in m.calls[0].args[0],false);
 const del=setup([[user],[track]]);const r=await req(del.app,'DELETE','/tracks/id/likes');assert.deepEqual(await r.json(),[]);assert.equal(del.calls[0].args[0],'hash');
 const missingId=setup([[user],[]]);assert.equal((await req(missingId.app,'POST','/tracks/id/likes')).status,404);const missingUri=setup([[user],[]]);assert.equal((await req(missingUri.app,'POST','/did/app.rocksky.song/key/likes')).status,500);
}
{
 const m=setup([[user]],true);assert.equal((await req(m.app,'POST','/did/app.rocksky.shout/key/replies',{message:'reply'})).status,200);assert.equal(m.calls[0].kind,'reply');assert.equal(m.calls[0].args[3],undefined,'source does not reject a missing agent before service');
 for(const method of ['POST','DELETE']){const x=setup([[user]]);assert.deepEqual(await (await req(x.app,method,'/did/app.rocksky.shout/key/likes')).json(),{});assert.equal(x.calls[0].kind,method==='POST'?'likeShout':'unlikeShout')}
}
console.log('Users mutations: twelve auth guards, caller agent order, shout validation/targets, likes payloads, missing-track asymmetry and service dispatch passed');
