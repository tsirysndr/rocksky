const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verifyLibrary } = require('../scripts/verify-android-engine.cjs');

function fixture(t, { machine = 183, alignment = 16384n, address = 16384n, loads = 1 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rocksky-elf-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const bytes = Buffer.alloc(120);
  bytes.write('7f454c460201', 0, 'hex');
  bytes.writeUInt16LE(machine, 18);
  bytes.writeBigUInt64LE(64n, 32);
  bytes.writeUInt16LE(56, 54);
  bytes.writeUInt16LE(loads, 56);
  bytes.writeUInt32LE(1, 64);
  bytes.writeBigUInt64LE(address, 80);
  bytes.writeBigUInt64LE(alignment, 112);
  const file = path.join(dir, 'engine.so');
  fs.writeFileSync(file, bytes);
  return file;
}

test('accepts 16 KB aligned ARM64 and x86_64 libraries', t => {
  for (const machine of [183, 62]) verifyLibrary(fixture(t, { machine }), machine);
});
test('rejects a library built for the wrong CPU', t => {
  assert.throws(() => verifyLibrary(fixture(t, { machine: 62 }), 183), /wrong CPU/);
});
test('rejects 4 KB alignment and misaligned LOAD addresses', t => {
  for (const options of [{ alignment: 4096n }, { address: 4096n }]) {
    assert.throws(() => verifyLibrary(fixture(t, options), 183), /not 16 KB aligned/);
  }
});
test('rejects an artifact with no loadable segments', t => {
  assert.throws(() => verifyLibrary(fixture(t, { loads: 0 }), 183), /no loadable segments/);
});
