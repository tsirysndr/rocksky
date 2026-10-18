import assert from 'node:assert/strict';
import { test } from 'node:test';
import { register } from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/app/rocksky/library/routes.mjs';
import { Credentials } from '../build/dev/javascript/rocksky_api/rocksky_api/node/xrpc_server.mjs';
import { Some, None } from '../build/dev/javascript/gleam_stdlib/gleam/option.mjs';

const auth = {credentials: new Credentials(new Some('did:test:one'),new None(),new None())};
test('library proxies preserve authentication, parameter sourcing and typed responses', async () => {
  const methods = new Map();
  const calls = [];
  const ctx = {db:{pool:{query:async (sql, args) => {
    assert.deepEqual(args, ['did:test:one',1]);
    return {rows:[['one.test']],rowCount:1};
  }}},env:{navidrome_internal_url:'http://library.test',navidrome_internal_secret:'internal-test'}};
  register({method:(name, config) => { assert.ok(!methods.has(name)); methods.set(name,config); }},ctx);
  assert.equal(methods.size,36);
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      calls.push({url:new URL(url),options});
      return new Response(JSON.stringify({'subsonic-response':{status:'ok',version:'1.16.1',song:{id:'track',title:'Song'}}}));
    };
    const call = (method, params={}, input, credentials=auth) => methods.get(`app.rocksky.library.${method}`).handler({params, input: input === undefined ? undefined : {body:input}, auth:credentials});
    assert.equal((await call('getSong',{id:'track'},undefined,{})).status,400);
    assert.equal(calls.length,0);
    const song = await call('getSong',{id:'track',u:'other'});
    assert.equal(song.body.song.title,'Song');
    assert.equal(calls[0].url.searchParams.get('u'),'one.test');
    assert.equal(calls[0].url.searchParams.get('f'),'json');
    assert.equal(calls[0].url.searchParams.get('id'),'track');
    assert.equal(calls[0].options.headers['X-Rocksky-Internal'],'internal-test');
    await call('savePlayQueue',{}, {id:'one,two', current:'two',position:123});
    assert.equal(calls[1].url.searchParams.get('id'),'one,two');
    assert.equal(calls[1].url.searchParams.get('current'),'two');
    globalThis.fetch = async (url, options) => {
      assert.equal(options.redirect,'manual');
      return new Response(null,{status:302,headers:{location:'https://cdn.test/audio'}});
    };
    assert.deepEqual((await call('getStreamUrl',{id:'track'})).body,{url:'https://cdn.test/audio'});
    for (const [code,status] of [[10,400],[40,401],[41,401],[50,403],[70,404],[0,500]]) {
      globalThis.fetch = async () => new Response(JSON.stringify({'subsonic-response':{status:'failed',error:{code,message:'failure'}}}));
      const response = await call('getSong',{id:'track'});
      assert.equal(response.status,status); assert.equal(response.message,'failure');
    }
    ctx.db.pool.query = async () => ({rows:[],rowCount:0});
    const unknown = await call('getSong',{id:'track'});
    assert.equal(unknown.status,401);
    assert.equal(unknown.message,'No user found for DID did:test:one');
  } finally { globalThis.fetch = previous; }
});
