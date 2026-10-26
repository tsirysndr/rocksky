import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
export const identityImpl = async () => {
 const [did,handle]=await (await import('../../cli/runtime/lib/getDidAndHandle.js')).getDidAndHandle();
 return {did,handle};
};
export const callImpl=name=>args=>async()=>{
 if(name==='agent')return (await import('../../cli/runtime/lib/agent.js')).createAgent(...args);
 return (await import('../../cli/runtime/cmd/sync.js'))[name](...args);
};
export const lockImpl=acquire=>did=>async()=>{
 const file=path.join(os.tmpdir(),`rocksky-${did}.lock`);
 if(acquire){
  try {await fs.writeFile(file,'',{flag:'wx'});}
  catch(error){if(error.code==='EEXIST')throw new Error(`Lock file already exists: ${file}`);throw error;}
  (await import('../../cli/runtime/lib/cleanUpSyncLock.js')).cleanUpSyncLockOnExit(did);
 }else await fs.unlink(file);
};
export const logImpl=message=>async()=>{console.log(message);};
