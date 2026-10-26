import fs from 'node:fs';
import path from 'node:path';
import envPaths from 'env-paths';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {Ok,Error as GleamError,toList} from '../../../gleam_stdlib/gleam.mjs';
export const directory=()=>process.env.ROCKSKY_CACHE_DIR||path.join(envPaths('rocksky',{suffix:''}).cache,'tracks');
export const entries=()=>{
 try{return toList(fs.readdirSync(directory()).filter(name=>!name.endsWith('.part')).flatMap(name=>{
  const file=path.join(directory(),name);try{const stat=fs.statSync(file);if(!stat.isFile())return [];return [{name,title:name,id:decodeURIComponent(name.replace(/\.[^.]+$/,'')),path:file,size:stat.size,modified:Math.floor(stat.mtimeMs)}];}catch{return [];}
 }));}catch{return toList([]);}
};
const jobs=new Map();
export const download=async(url,file)=>{
 if(jobs.has(file))return jobs.get(file);
 const task=(async()=>{const tmp=file+'.part';try{fs.mkdirSync(path.dirname(file),{recursive:true});const response=await fetch(url);if(!response.ok||!response.body)throw new Error(`Download failed: HTTP ${response.status}`);await pipeline(Readable.fromWeb(response.body),fs.createWriteStream(tmp));fs.renameSync(tmp,file);return new Ok(file);}catch(e){try{fs.unlinkSync(tmp);}catch{}return new GleamError(e.message);}finally{jobs.delete(file);}})();jobs.set(file,task);return task;
};
