import path from 'node:path';
export const openImpl=identifier=>password=>async()=>{
 const {Agent}=await import('../../cli/runtime/sdk.js');
 const {ImportIndex}=await import('../../cli/runtime/lib/importIndex.js');
 const {protectScrobbleWrites}=await import('../../cli/runtime/lib/importScrobble.js');
 const os=await import('node:os');const fs=await import('node:fs');
 const agent=await Agent.login(identifier,password);
 const directory=path.join(os.homedir(),'.rocksky','import-index');
 fs.mkdirSync(directory,{recursive:true});
 const index=new ImportIndex(directory);
 try {
  await index.open();agent.useIndex(index);protectScrobbleWrites(agent,index);
  await agent.syncRepo();
  const abort=new AbortController();
  const live=agent.hydrateFromJetstream({signal:abort.signal}).catch(error=>console.error(`Live dedup sync stopped: ${error.message}`));
  return {agent,index,abort,live};
 }catch(error){await index.close().catch(()=>{});throw error;}
};
export const closeImpl=session=>async()=>{
 session.abort.abort();
 try {await session.live;}finally{await session.index.close();}
};
export const configure=session=>policy=>()=>session.agent.configureRateLimit(policy);
export const publishImpl=session=>input=>async()=>{
 const {importScrobble}=await import('../../cli/runtime/lib/importScrobble.js');
 await importScrobble(session.agent,input,{did:session.agent.did,index:session.index});
};
export {loadCheckpoint,saveCheckpoint,clearCheckpoint} from '../../cli/runtime/import-io.js';
export const absolutePath=file=>path.resolve(file);
export const now=()=>new Date().toISOString();
export const watchSignals=flush=>()=>{
 const handler=()=>{
  try {flush();console.error('\nInterrupted; checkpoint saved. Re-run to resume.');}
  catch(error){console.error(`Could not save checkpoint: ${error.message}`);}
  process.exit(130);
 };
 process.on('SIGINT',handler);process.on('SIGTERM',handler);
 return ()=>{process.off('SIGINT',handler);process.off('SIGTERM',handler);};
};
export const preview=items=>()=>{
 console.log('Preview (first 10):');
 for(const item of items.slice(0,10))console.log(`${new Date(item.timestamp*1000).toISOString()}  ${item.title} — ${item.artist}${item.album?' · '+item.album:''}`);
 if(items.length>10)console.log(`… and ${items.length-10} more`);
};
