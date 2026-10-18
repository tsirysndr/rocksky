import assert from 'node:assert/strict';
import {test} from 'node:test';
import express from 'express';
import {once} from 'node:events';
import {app} from '../build/dev/javascript/rocksky_api/rocksky_api/api.mjs';
import {health} from '../build/dev/javascript/rocksky_api/rocksky_api/server.mjs';

test('root serves an ASCII AppView banner and project links as plain text', async () => {
  const api = app({env:{}, redis:{eval:async()=>1}, metrics:{request_duration:{record(){}}}});
  const res = await api.request('/');
  assert.equal(res.status,200);
  assert.match(res.headers.get('content-type'),/^text\/plain/);
  const body=await res.text();
  assert.match(body,/Rocksky AppView/);
  assert.ok(body.includes("    ____             __        __            ___              _    ___\n   / __ \\____  _____/ /_______/ /____  __   /   |  ____  ____| |  / (_)__ _      __\n  / /_/ / __ \\/ ___/ //_/ ___/ //_/ / / /  / /| | / __ \\/ __ \\ | / / / _ \\ | /| / /\n / _, _/ /_/ / /__/ ,< (__  ) ,< / /_/ /  / ___ |/ /_/ / /_/ / |/ / /  __/ |/ |/ /\n/_/ |_|\\____/\\___/_/|_/____/_/|_|\\__, /  /_/  |_/ .___/ .___/|___/_/\\___/|__/|__/\n                                /____/         /_/   /_/"));
  assert.ok(body.includes('https://docs.rocksky.app'));
  assert.ok(body.includes('https://tangled.org/rocksky.app/rocksky'));
});

test('XRPC health responds independently and passes unrelated routes through', async () => {
  const api=express(); let downstream=0;
  api.use(health());
  api.use((_req,res)=>{downstream++;res.status(503).end();});
  const server=api.listen(0,'127.0.0.1');
  await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const response=await fetch(base+'/xrpc/_health');
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.deepEqual(await response.json(),{status:'ok',version:'0.0.1'});
    const head=await fetch(base+'/xrpc/_health',{method:'HEAD'});
    assert.equal(head.status,200);assert.equal(await head.text(),'');
    assert.equal(downstream,0);
    assert.equal((await fetch(base+'/xrpc/app.rocksky.song.getSong')).status,503);
    assert.equal((await fetch(base+'/xrpc/_health',{method:'POST'})).status,503);
    assert.equal(downstream,2);
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
