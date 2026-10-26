import {context,propagation,trace,metrics,SpanKind,SpanStatusCode} from '@opentelemetry/api';
import {logs,SeverityNumber} from '@opentelemetry/api-logs';
const tracer=trace.getTracer('rocksky-feeds');
const meter=metrics.getMeter('rocksky-feeds');
const counter=meter.createCounter('feed_requests_total');
const duration=meter.createHistogram('feed_request_duration_seconds',{unit:'s'});
const items=meter.createHistogram('feed_items_returned');
const httpCount=meter.createCounter('http_requests_total');
const httpDuration=meter.createHistogram('http_request_duration_seconds',{unit:'s'});
const dbDuration=meter.createHistogram('db_query_duration_seconds',{unit:'s'});
const elapsed=start=>(performance.now()-start)/1000;
const failure=(span,message)=>{span.recordException(new Error(message));span.setStatus({code:SpanStatusCode.ERROR,message});};
export const outcome=(algo,status)=>counter.add(1,{algo,status});
export const feed_span=(algo,publisher,limit,paginated,authenticated,run)=>tracer.startActiveSpan('app.rocksky.feed.getFeedSkeleton',{attributes:{'feed.algo':algo,'feed.publisher':publisher,'feed.limit':limit,'feed.paginated':paginated,'feed.authenticated':authenticated}},async span=>{
 const start=performance.now();
 try{
  const result=await run();
  if(result.isOk()){const count=Array.from(result[0]).length;span.setAttribute('feed.items',count);items.record(count,{algo});outcome(algo,'ok');}
  else{failure(span,'Feed query failed');outcome(algo,'error');logs.getLogger('rocksky-feeds').emit({severityNumber:SeverityNumber.ERROR,severityText:'ERROR',body:'Feed query failed',attributes:{'feed.algo':algo}});console.error(`Feed ${algo} query failed`);}
  return result;
 }catch(error){failure(span,'Feed query failed');outcome(algo,'error');throw error;}
 finally{duration.record(elapsed(start),{algo});span.end();}
});
export const db_span=(statement,run)=>tracer.startActiveSpan('pg.query',{kind:SpanKind.CLIENT,attributes:{'db.system':'postgresql','db.operation':'SELECT','db.statement':statement}},async span=>{
 const start=performance.now();let status='error';
 try{const result=await run();if(result.isOk())status='ok';else failure(span,'PostgreSQL query failed');return result;}
 catch(error){failure(span,'PostgreSQL query failed');throw error;}
 finally{dbDuration.record(elapsed(start),{operation:'SELECT',status});span.end();}
});
const routes=new Set(['/','/.well-known/did.json','/xrpc/_health','/xrpc/app.rocksky.feed.describeFeedGenerator','/xrpc/app.rocksky.feed.getFeedSkeleton']);
export const http_span=(request,path,run)=>{
 const route=routes.has(path)?path.replace(/^\/xrpc\//,''):'not_found';
 const parent=propagation.extract(context.active(),Object.fromEntries(request.headers));
 return context.with(parent,()=>tracer.startActiveSpan(`${request.method} ${route}`,{kind:SpanKind.SERVER,attributes:{'http.route':route,'http.request.method':request.method}},async span=>{
  const start=performance.now();let status=500;
  try{const response=await run();status=response.status;span.setAttribute('http.response.status_code',status);if(status>=500)span.setStatus({code:SpanStatusCode.ERROR});return response;}
  finally{const labels={route,method:request.method,status};httpCount.add(1,labels);httpDuration.record(elapsed(start),labels);span.end();}
 }));
};
