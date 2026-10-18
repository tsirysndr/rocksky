import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Js } from '../build/dev/javascript/rocksky_api/rocksky_api/error.mjs';
import { is_transient, is_connection_error } from '../build/dev/javascript/rocksky_api/rocksky_api/db/retry.mjs';

test('Drizzle wrappers preserve connection retry classification and fatal exclusions',()=>{
  const reset=new Error('read ECONNRESET'); reset.code='ECONNRESET';
  const wrapped=new Js(new Error('Failed query: select ...',{cause:reset}));
  assert.equal(is_transient(wrapped),true); assert.equal(is_connection_error(wrapped),true);
  const refused=new Error('Unavailable'); refused.code='ECONNREFUSED';
  assert.equal(is_connection_error(new Js(new Error('Failed query',{cause:refused}))),true);
  const timedOut=new Js(new Error('Failed query',{cause:new Error('canceling statement due to statement timeout')}));
  assert.equal(is_transient(timedOut),false);
});

test('Connection recovery bounds retries, backs off and rejects non-connection failures',async()=>{
 const {retry_with}=await import('../build/dev/javascript/rocksky_api/rocksky_api/lib/pg_connection_recovery.mjs');
 const {Ok,Error:GError}=await import('../build/dev/javascript/rocksky_api/gleam.mjs');
 let attempts=0;const waits=[],events=[];const cause=new Js(Object.assign(new Error('reset'),{code:'ECONNRESET'}));
 let result=await retry_with(async()=>++attempts<4?new GError(cause):new Ok('ready'),6,async ms=>{waits.push(ms);},(n,ms)=>events.push([n,ms]));assert.ok(result instanceof Ok);assert.equal(result[0],'ready');assert.deepEqual(waits,[1000,2000,4000]);assert.deepEqual(events,[[1,1000],[2,2000],[3,4000]]);
 attempts=0;result=await retry_with(async()=>{attempts++;return new GError(cause);},3,async()=>{},()=>{});assert.equal(attempts,3);assert.equal(result[0],cause);
 assert.equal(is_connection_error(new Js(new Error('Query mentioned connection closed but is invalid SQL'))),false);
 const cycle=new Error('wrapper');cycle.cause=cycle;assert.equal(is_connection_error(new Js(cycle)),false);
});
