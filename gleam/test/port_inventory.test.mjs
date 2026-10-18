import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {register} from '../build/dev/javascript/rocksky_api/rocksky_api/xrpc/routes.mjs';
async function files(dir, extension) {
 const entries=await readdir(dir,{withFileTypes:true});
 return (await Promise.all(entries.map(e=>e.isDirectory()?files(`${dir}/${e.name}`,extension):e.name.endsWith(extension)?[`${dir}/${e.name}`]:[]))).flat();
}
test('Every original XRPC registration is present exactly once in the Gleam server',async()=>{
 const expected=new Set();
 for(const path of await files('../apps/api/src/xrpc','.ts')) {
  const source=await readFile(path,'utf8');
  for(const match of source.matchAll(/server\s*\.app\s*\.rocksky\s*\.(\w+)\s*\.(\w+)\s*\(/g)) expected.add(`app.rocksky.${match[1]}.${match[2]}`);
 }
 const actual=[];register({method:(name)=>actual.push(name)},{env:{}});
 assert.ok(expected.size>140);assert.equal(actual.length,new Set(actual).size);
 assert.deepEqual([...new Set(actual)].sort(),[...expected].sort());
});
test('Application queries use explicit Gleam ORM imports',async()=>{
 for(const path of await files('src','.gleam')) {
  const source=await readFile(path,'utf8');
  assert.doesNotMatch(source,/\borm\.[a-zA-Z_]/,path);
 }
});
test('Every original REST method is mounted in the Gleam app',async()=>{
 const {app}=await import('../build/dev/javascript/rocksky_api/rocksky_api/api.mjs');
 const shape=path=>path.replace(/:[^/]+/g,':param');
 const actual=new Set(app({env:{}}).routes.map(r=>`${r.method} ${shape(r.path)}`));
 const index=await readFile('../apps/api/src/index.ts','utf8');
 const imports=new Map([...index.matchAll(/import\s+(\w+)\s+from\s+"(\.\/[^";]+)"/g)].map(m=>[m[1],m[2]]));
 const sources=[['',index]];
 for(const m of index.matchAll(/app\.route\("([^"]+)",\s*(\w+)\)/g))sources.push([m[1],await readFile(`../apps/api/src/${imports.get(m[2])}.ts`,'utf8')]);
 assert.ok(![...actual].some(route=>/ \/import(?:\/|$)/.test(route)), 'History import routes are retired');
 let count=0;
 for(const [prefix,source] of sources)for(const m of source.matchAll(/app\.(get|post|put|patch|delete|options)\(\s*"([^"]+)"/g)) {
  const path=(prefix+'/'+m[2]).replaceAll(/\/+/g,'/').replace(/\/$/,'')||'/';
  assert.ok(actual.has(`${m[1].toUpperCase()} ${shape(path)}`),`${m[1]} ${path}`);count++;
 }
 assert.ok(count>100);
});
test('Runtime adapters do not import the TypeScript application',async()=>{
 for(const path of [...await files('src','.mjs'),...await files('entry','.mjs')]) {
  const source=await readFile(path,'utf8');
  for(const m of source.matchAll(/(?:from\s*|import\s*\(\s*|import\s*)["']([^"']+)["']/g))assert.ok(!m[1].endsWith('.ts')&&!m[1].includes('apps/api'),`${path}: ${m[1]}`);
 }
});
