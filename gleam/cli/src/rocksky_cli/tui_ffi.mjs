import fs from 'node:fs';
export const run=async output=>{
 if(!process.stdin.isTTY){console.error('The Rocksky TUI requires an interactive terminal.');process.exitCode=1;return;}
 const candidates=[new URL('./tui.mjs',import.meta.url),new URL('../../../../../cli/dist/tui.mjs',import.meta.url)];
 const bundle=candidates.find(url=>fs.existsSync(url));
 if(!bundle)throw new Error('TSX TUI bundle is missing. Run bun run build:cli.');
 const {tui}=await import(bundle.href);
 await tui(output?{output}:{});
};
