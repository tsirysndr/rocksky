import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareSpagoCache } from '../sdk/purescript/scripts/prepare-spago-cache.mjs';

async function fixture(t) {
  const cache = await mkdtemp(join(tmpdir(), 'spago-bootstrap-test-'));
  t.after(() => rm(cache, { recursive: true, force: true }));
  return cache;
}
async function checkout(args) {
  const target = args.at(-1);
  await mkdir(join(target, '.git'), { recursive: true });
  await writeFile(join(target, '.git/HEAD'), 'ref: refs/heads/main\n');
  await writeFile(join(target, '.git/index'), 'index fixture');
  if (args.at(-2).endsWith('/registry.git')) await mkdir(join(target, 'package-sets'));
}
const quiet = { log() {}, async sleep() {} };

test('cold cache initializes both registries and warm cache is reused', async t => {
  const cache = await fixture(t);
  const calls = [];
  const options = { ...quiet, runGit: async args => { calls.push(args); await checkout(args); } };
  await prepareSpagoCache(cache, options);
  assert.equal(calls.length, 2);
  await prepareSpagoCache(cache, options);
  assert.equal(calls.length, 2);
  assert.deepEqual((await readdir(cache)).sort(), ['registry', 'registry-index']);
});

test('partial registry is replaced after a successful retry; packages are preserved', async t => {
  const cache = await fixture(t);
  await mkdir(join(cache, 'registry-index/.git'), { recursive: true });
  await writeFile(join(cache, 'registry-index/.git/HEAD'), 'ref: refs/heads/main\n');
  await writeFile(join(cache, 'registry-index/partial'), 'incomplete');
  await writeFile(join(cache, 'package.tar.gz'), 'cached package');
  let calls = 0;
  await prepareSpagoCache(cache, { ...quiet, runGit: async args => {
    if (++calls === 1) throw new Error('temporary network failure');
    await checkout(args);
  } });
  assert.equal(calls, 3);
  assert.equal(await readFile(join(cache, 'package.tar.gz'), 'utf8'), 'cached package');
  assert.deepEqual(await readdir(join(cache, 'registry-index')), ['.git']);
  assert(!(await readdir(cache)).some(name => name.startsWith('.')));
});

test('persistent clone errors stop bootstrap after three attempts without destroying old data', async t => {
  const cache = await fixture(t);
  await mkdir(join(cache, 'registry-index'));
  await writeFile(join(cache, 'registry-index/partial'), 'incomplete');
  let attempts = 0;
  await assert.rejects(prepareSpagoCache(cache, { ...quiet, runGit: async () => {
    attempts++;
    throw new Error('git authentication failed');
  } }), /git authentication failed/);
  assert.equal(attempts, 3);
  assert.equal(await readFile(join(cache, 'registry-index/partial'), 'utf8'), 'incomplete');
  assert.deepEqual(await readdir(cache), ['registry-index']);
});

test('a clone without package sets is rejected before Spago starts', async t => {
  const cache = await fixture(t);
  let registryAttempts = 0;
  await assert.rejects(prepareSpagoCache(cache, { ...quiet, runGit: async args => {
    await checkout(args);
    if (args.at(-2).endsWith('/registry.git')) {
      registryAttempts++;
      await rm(join(args.at(-1), 'package-sets'), { recursive: true });
    }
  } }), /Incomplete registry checkout/);
  assert.equal(registryAttempts, 3);
  assert.deepEqual(await readdir(cache), ['registry-index']);
});
