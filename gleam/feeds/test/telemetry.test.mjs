import {test} from 'node:test';
import assert from 'node:assert/strict';
import {trace,metrics} from '@opentelemetry/api';
import {Ok,Error as GleamError,toList} from '../../build/dev/javascript/gleam_stdlib/gleam.mjs';
const spans=[],measurements=[];
trace.setGlobalTracerProvider({getTracer:()=>({startActiveSpan(name,options,callback){const record={name,attributes:{...options.attributes},ended:false};spans.push(record);return callback({setAttribute(k,v){record.attributes[k]=v;},recordException(){},setStatus(s){record.status=s;},end(){record.ended=true;}});}})});
metrics.setGlobalMeterProvider({getMeter:()=>({createCounter(name){return {add(value,labels){measurements.push({name,value,labels});}};},createHistogram(name){return {record(value,labels){measurements.push({name,value,labels});}};}})});
const telemetry=await import('../../build/dev/javascript/rocksky_feeds/rocksky_feeds/telemetry_ffi.mjs');

test('feed/database telemetry records outcomes and ends spans without personal or bind values',async()=>{
 await telemetry.feed_span('all','did:plc:publisher',50,true,true,async()=>new Ok(toList([{},{}])));
 await telemetry.feed_span('jazz','did:plc:publisher',5,false,false,async()=>new GleamError('private-value'));
 await telemetry.db_span('select uri from scrobbles where timestamp < $1',async()=>new Ok(toList([])));
 await telemetry.http_span(new Request('http://localhost/xrpc/_health?token=secret',{headers:{authorization:'Bearer secret'}}),'/xrpc/_health',async()=>new Response('{}'));
 assert.ok(spans.every(s=>s.ended));assert.equal(spans[0].attributes['feed.authenticated'],true);assert.equal(spans[0].attributes['feed.items'],2);
 assert.ok(measurements.some(m=>m.name==='feed_requests_total'&&m.labels.status==='error'));
 assert.ok(measurements.some(m=>m.name==='http_requests_total'&&m.labels.route==='_health'));
 assert.ok(measurements.some(m=>m.name==='db_query_duration_seconds'&&m.labels.status==='ok'));
 assert.doesNotMatch(JSON.stringify({spans,measurements}),/private-value|secret|authorization/);
});
