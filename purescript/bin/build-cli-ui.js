import {readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('../cli/runtime/',import.meta.url));
async function sources(directory){
 const result=[];
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const file=path.join(directory,entry.name);
  if(entry.isDirectory())result.push(...await sources(file));
  else if(/\.tsx?$/.test(file) && !file.endsWith('.d.ts'))result.push(file);
 }
 return result;
}
await build({entryPoints:await sources(root),outdir:root,outbase:root,format:'esm',platform:'node',target:'node22',jsx:'automatic',bundle:false,logLevel:'warning'});
