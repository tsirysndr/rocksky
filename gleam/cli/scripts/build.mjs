import {build} from 'esbuild';
import {chmod,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
await mkdir(new URL('../dist/',import.meta.url),{recursive:true});
await build({absWorkingDir:root,entryPoints:['cli/index.mjs'],outfile:'cli/dist/index.mjs',bundle:true,platform:'node',format:'esm',packages:'external',banner:{js:'#!/usr/bin/env node'}});
await chmod(new URL('../dist/index.mjs',import.meta.url),0o755);

await build({absWorkingDir:root,entryPoints:["cli/test/support-entry.mjs"],outfile:"cli/dist/test-support.mjs",bundle:true,platform:"node",format:"esm",packages:"external"});

// Keep apps/cli's TSX/Ink implementation as the source of truth for the UI.
const ui=await build({absWorkingDir:root,entryPoints:['../apps/cli/src/cmd/tui.tsx'],outfile:'cli/dist/tui.mjs',tsconfig:'../apps/cli/tsconfig.json',bundle:true,platform:'node',format:'esm',packages:'external',metafile:true});
await (await import('node:fs/promises')).writeFile(new URL('../dist/tui-meta.json',import.meta.url),JSON.stringify(ui.metafile,null,2));
