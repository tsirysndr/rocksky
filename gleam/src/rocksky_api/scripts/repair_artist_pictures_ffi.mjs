import 'dotenv/config';
import { Options, Counts } from './repair_artist_pictures.mjs';
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
export async function options() {
  const config = shared.parseOptions(process.argv.slice(2));
  const opts = new Options(config.help,config.dryRun,config.limit,config.batchSize);
  opts.config = config;
  return opts;
}
export const help = () => shared.help;
export const open = opts => shared.openRepair(opts.config);
export const close = shared.closeRepair;
export async function batch(session,size) {
  const c = await shared.repairBatch(session,size);
  return new Counts(c.scanned,c.matched,c.updated);
}
