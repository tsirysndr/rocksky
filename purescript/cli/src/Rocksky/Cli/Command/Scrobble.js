export const cacheGetImpl=key=>async()=>(await import('../../cli/runtime/context.js')).ctx.kv.getItem(key);
export const cachePutImpl=key=>value=>async()=>{await (await import('../../cli/runtime/context.js')).ctx.kv.setItem(key,value);};
export const publishImpl=track=>timestamp=>dryRun=>async()=>{
 const {publishScrobble}=await import('../../cli/runtime/scrobble.js');
 return publishScrobble(track,timestamp,dryRun);
};
