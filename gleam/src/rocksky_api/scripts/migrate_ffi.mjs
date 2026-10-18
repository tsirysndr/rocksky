import { Ok, Error as GError } from '../../gleam.mjs';
import { Js } from '../error.mjs';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function runMigrations(database, directory) {
  try {
    let root = dirname(fileURLToPath(import.meta.url));
    while (!existsSync(join(root, 'tools/db/migrate.mjs'))) {
      const parent = dirname(root);
      if (parent === root) throw new Error('Cannot find repository migration runner');
      root = parent;
    }
    const { migrate } = await import(pathToFileURL(join(root, 'tools/db/migrate.mjs')).href);
    return new Ok(await migrate(database.pool, directory));
  } catch (error) { return new GError(new Js(error)); }
}
