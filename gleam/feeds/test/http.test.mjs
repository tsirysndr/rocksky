import {test} from 'node:test';
import assert from 'node:assert/strict';
import {serve} from '@hono/node-server';
import {fetch_handler} from '../../build/dev/javascript/rocksky_feeds/rocksky_feeds/host_ffi.mjs';
import {handle} from '../../build/dev/javascript/rocksky_feeds/rocksky_feeds.mjs';
import {Config} from '../../build/dev/javascript/rocksky_feeds/rocksky_feeds/types.mjs';
import {Ok,toList} from '../../build/dev/javascript/gleam_stdlib/gleam.mjs';

test('Node HTTP server serves discovery, query validation and bodyless HEAD',async()=>{
 const config=new Config('feeds.example',8002,'unused','http-test');
 const fetcher=fetch_handler((method,path,params,auth)=>handle(config,method,path,params,auth,async()=>new Ok(toList([])),async()=>false));
 const server=serve({fetch:fetcher,hostname:'127.0.0.1',port:0});
 try{
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const url=`http://127.0.0.1:${server.address().port}`;
  assert.deepEqual(await (await fetch(url+'/xrpc/_health')).json(),{version:'http-test'});
  const describe=await (await fetch(url+'/xrpc/app.rocksky.feed.describeFeedGenerator')).json();assert.equal(describe.feeds.length,52);
  const feed=await fetch(url+'/xrpc/app.rocksky.feed.getFeedSkeleton?'+new URLSearchParams({feed:describe.feeds[0].uri,limit:'2'}));assert.deepEqual(await feed.json(),{feed:[]});
  assert.equal((await fetch(url+'/xrpc/app.rocksky.feed.getFeedSkeleton')).status,400);
  assert.equal(await (await fetch(url+'/xrpc/_health',{method:'HEAD'})).text(),'');
 }finally{await new Promise(resolve=>server.close(resolve));}
});
