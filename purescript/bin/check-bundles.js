// Import generated bundles without executing their startup main (no live services).
import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const envSource=await readFile(new URL('../api/src/Rocksky/Lib/Env.purs',import.meta.url),'utf8');
const env={...process.env,NODE_ENV:'test'};
for(const [,key] of envSource.matchAll(/"([A-Z0-9_]+)": str required/g))env[key]='bundle-smoke-test';
for(const name of ['index','server']){
 const file=new URL(`../api/dist/${name}.js`,import.meta.url);
 const source=await readFile(file,'utf8');
 assert.equal([...source.matchAll(/^main\(\);$/gm)].length,1,'exactly one entrypoint invocation');
 const smoke=new URL(`../api/dist/.smoke-${name}.mjs`,import.meta.url);
 try{
  await writeFile(smoke,source.replace(/^main\(\);$/m,'// Startup deliberately omitted for import smoke test.'));
  const r=spawnSync(process.execPath,[smoke.pathname],{env,encoding:'utf8',timeout:30000});
  assert.equal(r.status,0,`${name} bundle import failed: ${r.stderr}\n${r.stdout}`);
  console.log(`${name} bundle imports successfully without starting services`);
 }finally{await unlink(smoke).catch(()=>{});}
}
