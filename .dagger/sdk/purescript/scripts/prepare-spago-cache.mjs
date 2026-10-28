// Cold module runtimes share this cache. The caller must mount it with LOCKED
// sharing so registry checkouts and Spago's SQLite database have one writer.
import { spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';

const repositories = [
  { name: 'registry-index', required: '.git/HEAD' },
  { name: 'registry', required: 'package-sets' },
];

function git(args) {
  const result = spawnSync('git', args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ${args[0]} failed (${result.signal ?? result.status})`);
}

async function complete(directory, required) {
  try {
    await access(join(directory, '.git/HEAD'));
    await access(join(directory, '.git/index'));
    await access(join(directory, required));
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return false;
  }
}

export async function prepareSpagoCache(cache, { runGit = git, sleep = setTimeout, log = console.error } = {}) {
  await mkdir(cache, { recursive: true });
  for (const { name, required } of repositories) {
    const target = join(cache, name);
    if (await complete(target, required)) continue;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const staging = await mkdtemp(join(cache, `.${name}-bootstrap-`));
      const checkout = join(staging, 'checkout');
      try {
        log(`Initializing Spago ${name} (attempt ${attempt}/3)`);
        await runGit(['clone', '--depth=1', '--branch=main', `https://github.com/purescript/${name}.git`, checkout]);
        if (!await complete(checkout, required)) throw new Error(`Incomplete ${name} checkout`);
        // Replace only an incomplete registry, and only after its replacement
        // has finished cloning. Keep downloaded packages and the database.
        await rm(target, { recursive: true, force: true });
        await rename(checkout, target);
        break;
      } catch (error) {
        log(`${name}: ${error.message}`);
        if (attempt === 3) throw error;
        await sleep(attempt * 1000);
      } finally {
        await rm(staging, { recursive: true, force: true });
      }
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareSpagoCache('/root/.cache/spago-nodejs');
}
