// Run each registered JS regression suite once, after building the workspace.
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const {scripts}=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
const suites=[...new Set(Object.entries(scripts).filter(([name])=>name!=='test:all').flatMap(([,command])=>[...command.matchAll(/node (bin\/test-[\w-]+\.js)/g)].map(match=>match[1])))];
const failed=[];
for(const suite of suites){
 const result=spawnSync(process.execPath,[suite],{stdio:'inherit',timeout:180000});
 if(result.status!==0){failed.push(suite);console.error(`FAILED ${suite}`,result.error??`exit ${result.status}`);}
}
console.log(`${suites.length-failed.length}/${suites.length} regression suites passed.`);
if(failed.length){console.error(failed.join('\n'));process.exitCode=1;}
