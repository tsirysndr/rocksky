import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
let root = dirname(fileURLToPath(import.meta.url));
while (!existsSync(join(root, 'tools/db/artist-pictures.mjs'))) {
  const parent = dirname(root);
  if (parent === root) throw new Error('Cannot find shared artist picture repair');
  root = parent;
}
const shared = await import(pathToFileURL(join(root, 'tools/db/artist-pictures.mjs')).href);
export const help = shared.help;
export const options = async () => shared.parseOptions(process.argv.slice(3));
export const open = opts => () => shared.openRepair(opts);
export const close = session => () => shared.closeRepair(session);
export const batch = session => size => () => shared.repairBatch(session,size);
