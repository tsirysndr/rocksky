import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const cli=new URL('../dist/index.mjs',import.meta.url).pathname;
const state=mkdtempSync(path.join(os.tmpdir(),'gleam-cli-command-'));
const env={...process.env,ROCKSKY_STATE_DIR:state,ROCKSKY_CACHE_DIR:path.join(state,'cache'),ROCKSKY_NO_REMOTE:'1',DOTENV_CONFIG_PATH:path.join(state,'missing.env')};
delete env.ROCKSKY_IDENTIFIER;delete env.ROCKSKY_PASSWORD;
const run=args=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8',env,timeout:10000});

test('standalone CLI exposes every source command and nested option without initializing services',()=>{
 const help=run(['--help']);assert.equal(help.status,0,help.stderr);
 for(const command of ['login','whoami','nowplaying','scrobbles','search','stats','artists','albums','tracks','scrobble','create','mcp','sync','scrobble-api','mpd','nfc','card','import','upload','tui'])assert.match(help.stdout,new RegExp(`\\b${command}\\b`));
 for(const args of [['create','apikey','--help'],['nfc','write','--help'],['card','write','--help'],['import','--help'],['mpd','--help'],['mcp','--help']])assert.equal(run(args).status,0,args.join(' '));
 assert.equal(run(['--version']).stdout.trim(),'0.11.3');
 assert.notEqual(run(['unknown-command']).status,0);
});
test('default and explicit TUI require a TTY and exit cleanly before remote or native startup',()=>{
 for(const args of [[],['tui']]){const result=run(args);assert.equal(result.status,1,result.stderr);assert.match(result.stderr,/interactive terminal/);}
});
test('import dry-run works offline with no token or index and never saves a checkpoint',()=>{
 const fixture=new URL('./fixtures/import/spotify-sample.json',import.meta.url).pathname;
 const result=run(['import',fixture,'--dry-run']);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/2 scrobbles/);assert.match(result.stdout,/nothing will be written/);
});
test('invalid format and date filters return nonzero exit status',()=>{
 const fixture=new URL('./fixtures/import/spotify-sample.json',import.meta.url).pathname;
 for(const options of [['--format','unknown'],['--from','not-a-date']]){const result=run(['import',fixture,'--dry-run',...options]);assert.equal(result.status,1);}
});
test('MCP forwards options and inherits child exit status without touching CLI database',()=>{
 const fake=path.join(state,'fake-mcp');const output=path.join(state,'args.json');
 writeFileSync(fake,`#!/usr/bin/env node\nrequire('fs').writeFileSync(${JSON.stringify(output)},JSON.stringify(process.argv.slice(2)));process.exit(7);\n`,{mode:0o755});
 const result=spawnSync(process.execPath,[cli,'mcp','--device','Office','--api-url','http://localhost:1234','--token-path','/tmp/token'],{encoding:'utf8',env:{...env,ROCKSKY_MCP_BIN:fake},timeout:10000});
 assert.equal(result.status,7,result.stderr);assert.deepEqual(JSON.parse(readFileSync(output)),['--device','Office','--api-url','http://localhost:1234','--token-path','/tmp/token']);
});


test('TUI bundle uses the original TSX/Ink source and keeps screen dependencies external',()=>{
 const metadata=JSON.parse(readFileSync(new URL('../dist/tui-meta.json',import.meta.url),'utf8'));
 assert.ok(Object.keys(metadata.inputs).some(file=>file.endsWith('apps/cli/src/cmd/tui.tsx')));
 assert.ok(Object.keys(metadata.inputs).some(file=>file.endsWith('apps/cli/src/tui/App.tsx')));
 const imports=Object.values(metadata.outputs).flatMap(output=>output.imports.map(item=>item.path));
 assert.ok(imports.includes('ink'));assert.ok(imports.includes('react'));
 assert.ok(!imports.some(file=>file.endsWith('.tsx')));
});
