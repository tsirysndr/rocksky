import {spawn} from 'node:child_process';
import {Ok,Error as GError} from '../../gleam.mjs';
export const run=(command,args,timeout)=>new Promise(resolve=>{
 const child=spawn(command,args.toArray(),{stdio:['ignore','ignore','pipe']});
 let stderr='';const timer=setTimeout(()=>child.kill('SIGKILL'),timeout);
 child.stderr.on('data',chunk=>{stderr+=chunk;});
 child.on('error',e=>{clearTimeout(timer);resolve(new GError(e));});
 child.on('close',code=>{clearTimeout(timer);resolve(new Ok({code:code??-1,stderr}));});
});
