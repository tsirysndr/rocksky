import pg from 'pg';
import {serve as nodeServe} from '@hono/node-server';
import {AtUri} from '@atproto/syntax';
import {DidResolver} from '@atproto/identity';
import {verifyJwt} from '@atproto/xrpc-server';
import {toList} from '../../gleam_stdlib/gleam.mjs';
import {None,Some} from '../../gleam_stdlib/gleam/option.mjs';
import {connection,execute} from './drizzle_ffi.mjs';
import {http_span} from './telemetry_ffi.mjs';

export const env=name=>process.env[name]??'';
export const fail=message=>{console.error(message);process.exitCode=1;};
export const pool_options=url=>({connectionString:url,max:20,idleTimeoutMillis:30000,connectionTimeoutMillis:5000,application_name:'rocksky-feeds:replica',statement_timeout:60000,idle_in_transaction_session_timeout:30000});
export const open_database=url=>{
 const pool=new pg.Pool(pool_options(url));
 pool.on('error',()=>console.error('Idle PostgreSQL connection failed'));
 return connection(pool);
};
export const query=execute;
const resolver=new DidResolver({});
export const verify_with_key=async(token,resolve)=>{
 try{await verifyJwt(token,null,null,resolve);return true;}
 catch{return false;}
};
export const verify=token=>verify_with_key(token,did=>resolver.resolveAtprotoKey(did));
export const cursor=value=>{const n=Number.parseInt(value,10);return Number.isSafeInteger(n)&&Math.abs(n)<=8640000000000000?new Some(n):new None();};
export const valid_uri=value=>{
 try{const uri=new AtUri(value);return value.startsWith('at://')&&!!uri.hostname&&!!uri.collection&&!!uri.rkey;}catch{return false;}
};
export const fetch_handler=handler=>async request=>{
 const url=new URL(request.url);
 return http_span(request,url.pathname,async()=>{
  try{
   const response=await handler(request.method,url.pathname,toList(Array.from(url.searchParams)),request.headers.get('authorization')??'');
   return new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers:{'Content-Type':response.content_type}});
  }catch{return Response.json({error:'InternalServerError',message:'Feed request failed'},{status:500});}
 });
};
export const serve=(config,database,handler)=>{
 const server=nodeServe({fetch:fetch_handler(handler),port:config.port},info=>console.log(`Rocksky feeds listening on port ${info.port}`));
 server.on('error',error=>{console.error(`Feed server failed: ${error.code??'listen error'}`);void database.end().then(()=>globalThis.__rockskyFeedsShutdown?.());process.exitCode=1;});
 let closing=false;
 const close=()=>{
  if(closing)return;closing=true;
  process.off('SIGINT',close);process.off('SIGTERM',close);
  server.close(async()=>{await database.end();if(globalThis.__rockskyFeedsShutdown)await globalThis.__rockskyFeedsShutdown();});
 };
 process.once('SIGINT',close);process.once('SIGTERM',close);
};
