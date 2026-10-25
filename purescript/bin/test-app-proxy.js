import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
const tests = readdirSync(new URL('../app-proxy/test/', import.meta.url))
  .filter(name => name.endsWith('.test.js'))
  .map(name => new URL(`../app-proxy/test/${name}`, import.meta.url).pathname);
const result = spawnSync(process.execPath, ['--test', ...tests], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
