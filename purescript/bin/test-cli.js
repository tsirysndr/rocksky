import {spawnSync} from 'node:child_process';
const ui=spawnSync(process.execPath,[new URL('./build-cli-ui.js',import.meta.url).pathname],{stdio:'inherit'});
if(ui.error)throw ui.error;
if(ui.status!==0)process.exit(ui.status??1);
const cwd=new URL('../cli/',import.meta.url);
for(const [command,args] of [['bun',['test','test']],['node',['test/importParsers.smoke.js']],['bun',['test/tui-render-smoke.js']]]) {
 const result=spawnSync(command,args,{cwd,stdio:'inherit'});
 if(result.error)throw result.error;
 if(result.status!==0){process.exitCode=result.status??1;break;}
}
