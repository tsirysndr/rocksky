import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const installer=resolve(import.meta.dirname,'../../../install.sh');
for(const [os,cpu,platform,arch] of [['Linux','x86_64','linux','x86_64'],['Linux','aarch64','linux','aarch64'],['Darwin','arm64','darwin','aarch64']]){
 test(`installer selects ${platform}/${arch}, supports both variants and preserves existing binary on checksum failure`,()=>{
  const temporary=mkdtempSync(join(tmpdir(),'rocksky-install-test-'));
  try{
   const mocks=join(temporary,'commands'),bin=join(temporary,'bin with spaces');mkdirSync(mocks);mkdirSync(bin);
   const payload='#!/bin/sh\nprintf "installed\\n"\n';const checksum=createHash('sha256').update(payload).digest('hex');
   writeFileSync(join(mocks,'uname'),`#!/bin/sh\nif [ "$1" = -s ]; then echo ${os}; else echo ${cpu}; fi\n`,{mode:0o755});
   writeFileSync(join(temporary,'payload'),payload);
   writeFileSync(join(mocks,'curl'),`#!/bin/sh\nwhile [ "$#" -gt 0 ]; do\ncase "$1" in https://*) url=$1 ;; --output) shift; output=$1 ;; esac\nshift\ndone\nprintf '%s\\n' "$url" >> "$INSTALL_TEST_DIR/requests"\ncase "$url" in\n*'releases?per_page='*) printf '[{\\n"tag_name": "playerd-1.0.0"\\n},{\\n"tag_name": "rocksky-cli-v0.11.3"\\n}]' > "$output" ;;\n*.sha256) printf '%s  asset\\n' "$INSTALL_TEST_CHECKSUM" > "$output" ;;\n*) cp "$INSTALL_TEST_DIR/payload" "$output" ;;\nesac\n`,{mode:0o755});
   const env={...process.env,PATH:mocks+':'+process.env.PATH,INSTALL_TEST_DIR:temporary,INSTALL_TEST_CHECKSUM:checksum,ROCKSKY_INSTALL_DIR:bin};
   for(const variant of ['typescript','purescript']){
    const result=spawnSync('sh',[installer,'--variant',variant],{env,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);assert.ok(result.stdout.includes('    ____             __        __'));assert.ok(result.stdout.includes('                                /____/'));assert.equal(readFileSync(join(bin,'rocksky'),'utf8'),payload);
    const asset=(variant==='purescript'?'rocksky-purescript':'rocksky')+'-'+platform+'-'+arch;
    assert.ok(readFileSync(join(temporary,'requests'),'utf8').includes('/rocksky-cli-v0.11.3/'+asset));
   }
   const result=spawnSync('sh',[installer,'--version','0.11.3'],{env:{...env,INSTALL_TEST_CHECKSUM:'0'.repeat(64)},encoding:'utf8'});
   assert.notEqual(result.status,0);assert.match(result.stderr,/checksum mismatch/);assert.equal(readFileSync(join(bin,'rocksky'),'utf8'),payload);
   assert.deepEqual(readdirSync(bin),['rocksky']);
  }finally{rmSync(temporary,{recursive:true,force:true});}
 });
}
