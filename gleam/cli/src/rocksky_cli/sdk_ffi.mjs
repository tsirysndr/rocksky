import {Ok,Error as GleamError,toList} from '../../gleam_stdlib/gleam.mjs';
import fs from 'node:fs';
const attempt=async work=>{try{return new Ok(await work());}catch(e){return new GleamError(e.message);}};
export const login=(identifier,password)=>attempt(async()=>{const {Agent}=await import('@rocksky/sdk');return Agent.login(identifier,password);});
export const did=agent=>agent.did;
// The SDK owns repository decoding, persistence and throttling. This adapter
// adds the CLI's album-independent identity callback to its dedup interface.
export const open_index=(agent,path,key)=>attempt(async()=>{
 const [{RockskyIndex},{MemoryBlockstore,Repo,readCarWithRoot}]=await Promise.all([import('@rocksky/sdk/dedup'),import('@atproto/repo')]);
 class Index extends RockskyIndex {
  plays=new Map();identities=new Map();running=new Map();records=[];
  forget(uri){const k=this.identities.get(uri);if(k===undefined)return;const uris=this.plays.get(k);uris.delete(uri);if(!uris.size)this.plays.delete(k);this.identities.delete(uri);}
  remember(did,uri,record){
   this.forget(uri);const {title,artist,createdAt}=record??{};
   const secs=Math.floor(Date.parse(createdAt)/1000);
   if(typeof title!=='string'||typeof artist!=='string'||!title.trim()||!artist.trim()||!Number.isFinite(secs))return;
   const k=key(did,title,artist,secs),uris=this.plays.get(k)??new Set();uris.add(uri);this.plays.set(k,uris);this.identities.set(uri,k);
  }
  async indexCar(did,car){
   const {root,blocks}=await readCarWithRoot(car),repo=await Repo.load(new MemoryBlockstore(blocks),root);
   if(repo.did!==did)throw new Error('Dedup repository DID does not match the signed-in account');
   this.plays.clear();this.identities.clear();this.records=[];
   for await(const entry of repo.walkRecords()){this.records.push({...entry,uri:`at://${did}/${entry.collection}/${entry.rkey}`,cid:String(entry.cid)});if(entry.collection==='app.rocksky.scrobble')this.remember(did,`at://${did}/${entry.collection}/${entry.rkey}`,entry.record);}
   const stats=await super.indexCar(did,car);return {...stats,scrobbles:this.identities.size};
  }
  async scrobbleUri(did,title,artist,album,seconds){return this.plays.get(key(did,title,artist,seconds))?.values().next().value;}
  async recordScrobble(did,title,artist,album,seconds,uri){this.remember(did,uri,{title,artist,createdAt:new Date(seconds*1000).toISOString()});await super.recordScrobble(did,title,artist,album,seconds,uri);}
  async applyCommit(did,col,operation,rkey,record){if(col==='app.rocksky.scrobble'){const uri=`at://${did}/${col}/${rkey}`;if(operation==='delete')this.forget(uri);else if(record)this.remember(did,uri,record);}await super.applyCommit(did,col,operation,rkey,record);if(this.onCommit)await this.onCommit({did,collection:col,operation,uri:`at://${did}/${col}/${rkey}`,cid:null,record});}
 }
 fs.mkdirSync(path,{recursive:true});const index=new Index(path);await index.open();agent.useIndex(index);
 const publish=agent.scrobble.bind(agent);
 agent.scrobble=async record=>{
  const seconds=Math.floor(Date.parse(record.createdAt??'')/1000);
  if(!Number.isFinite(seconds))throw new Error('Imported scrobbles require a valid play timestamp');
  const k=key(agent.did,record.title,record.artist,seconds);
  while(index.running.has(k))await index.running.get(k).catch(()=>{});
  const job=(async()=>await index.scrobbleUri(agent.did,record.title,record.artist,record.album,seconds)??await publish(record))();index.running.set(k,job);
  try{return await job;}finally{index.running.delete(k);}
 };
 return index;
});
export const sync=agent=>attempt(()=>agent.syncRepo());
export const hydrate=agent=>{const controller=new AbortController();const done=agent.hydrateFromJetstream({signal:controller.signal}).catch(e=>{if(!controller.signal.aborted)console.error(`Live dedup sync stopped: ${e.message}`);});return {controller,done};};
export const stop=async subscription=>{subscription.controller.abort();await subscription.done;};
export const close=async index=>{await index.close();};
export const rate_limit=(agent,rate,disabled)=>agent.configureRateLimit(disabled?{disabled:true}:rate>0?{writesPerHour:rate*4}:{});
export const publish=async(agent,index,input,fallback)=>{
 try {
  const existing=await index.scrobbleUri(agent.did,input.title,input.artist,input.album??'',input.timestamp);if(existing)return new Ok(existing);
  try{return new Ok(await agent.scrobbleMatch(input));}catch(error){if(!fallback(error))throw error;}
  return new Ok(await agent.scrobble({title:input.title,artist:input.artist,album:input.album??'',albumArtist:input.artist,duration:0,mbid:input.mbId,isrc:input.isrc,createdAt:new Date(input.timestamp*1000).toISOString()}));
 }catch(error){return new GleamError(error);}
};
export const signal=callback=>{process.on('SIGINT',callback);process.on('SIGTERM',callback);return ()=>{process.off('SIGINT',callback);process.off('SIGTERM',callback);};};
export const parallel=async(items,concurrency,work)=>{const queue=Array.from(items);let next=0;await Promise.all(Array.from({length:Math.min(concurrency,queue.length)},async()=>{while(next<queue.length){const item=queue[next++];await work(item);}}));};

export const records=index=>toList(index.records);

export const watch_index=(index,callback)=>{index.onCommit=callback;return ()=>{index.onCommit=null;};};
export const until_signal=()=>new Promise(resolve=>{const stop=()=>{process.off("SIGINT",stop);process.off("SIGTERM",stop);resolve();};process.once("SIGINT",stop);process.once("SIGTERM",stop);});
