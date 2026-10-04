const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const sdk = path.resolve(root, '../../sdk/typescript');
const entries = ['index', 'remote', 'dedup'].map(name => path.join(sdk, 'src', `${name}.ts`));
for (const entry of entries) {
  if (!fs.existsSync(entry)) throw new Error(`SDK source missing from EAS archive: ${entry}. Run EAS from apps/app within the full repository.`);
}
// SDK dist/ is gitignored. Build its runtime entries inside this app so Metro
// never depends on artifacts or node_modules from the developer's machine.
const result = spawnSync('bun', ['build', ...entries, '--outdir', path.join(root, '.generated/rocksky-sdk'), '--target', 'node', '--format', 'esm', '--packages', 'external'], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
