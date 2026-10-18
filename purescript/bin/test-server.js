import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const env=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');process.env.NODE_ENV='test';for(const [,key] of env.matchAll(/"([A-Z0-9_]+)": str required/g))process.env[key]='server-test';
const {refreshViews}=await import('../output/Rocksky.Server/index.js');const {fromAff}=await import('../output/Control.Promise/index.js');
for(const failure of [null,'SET','REFRESH MATERIALIZED VIEW CONCURRENTLY user_artists_mv','VACUUM']){
 const calls=[];const client={async query(sql){calls.push(sql);if(failure&&sql.startsWith(failure))throw new Error('mock query failure');return {rows:[]}},release(destroy){calls.push(['release',destroy])}};
 await fromAff(refreshViews({async connect(){return client}}))();assert.deepEqual(calls.at(-1),['release',true]);assert.equal(calls.filter(x=>Array.isArray(x)).length,1);
 if(failure==='SET')assert.equal(calls.length,2);else{assert.ok(calls.includes('REFRESH MATERIALIZED VIEW CONCURRENTLY chart_tracks_mv'));assert.equal(calls.some(x=>typeof x==='string'&&x.startsWith('VACUUM')),failure!=='REFRESH MATERIALIZED VIEW CONCURRENTLY user_artists_mv')}
}
console.log('XRPC refresh cron: per-view recovery and client destruction on success/SET/refresh/VACUUM failure passed');

const Express = await import('../output/Express/index.js');
const {health} = await import('../output/Rocksky.Server/index.js');
const {once} = await import('node:events');
const app=Express.new();
Express.useMiddleware(app)(health)();
app.use((_req,res)=>res.status(503).end());
const server=app.listen(0,'127.0.0.1');
await once(server,'listening');
const url=`http://127.0.0.1:${server.address().port}`;
try {
 const response=await fetch(url+'/xrpc/_health');
 assert.equal(response.status,200);
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.deepEqual(await response.json(),{status:'ok',version:'0.0.1'});
 const head=await fetch(url+'/xrpc/_health',{method:'HEAD'});
 assert.equal(head.status,200);assert.equal(await head.text(),'');
 assert.equal((await fetch(url+'/xrpc/_health',{method:'POST'})).status,503);
 assert.equal((await fetch(url+'/xrpc/app.rocksky.song.getSong')).status,503);
} finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
console.log('XRPC health: GET/HEAD work without REST/storage; unrelated requests pass through.');
