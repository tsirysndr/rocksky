// OS primitives only. CI decisions and command construction live in PureScript.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
export const args = () => process.argv.slice(2);
export const platform = () => process.platform;
export const arch = () => process.arch;
export const cwd = () => process.cwd();
export const env = name => () => process.env[name] ?? '';
export const setEnv = name => value => () => { process.env[name] = value; };
export const read = file => () => fs.readFileSync(file, 'utf8');
export const write = file => value => () => fs.writeFileSync(file, value);
export const append = file => value => () => fs.appendFileSync(file, value);
export const mkdir = dir => () => { fs.mkdirSync(dir, { recursive: true }); };
export const temporary = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rocksky-ci-'));
export const remove = file => () => fs.rmSync(file, { recursive: true, force: true });
export const exists = file => () => fs.existsSync(file);
export const entries = dir => () => fs.readdirSync(dir);
export const copy = source => target => () => fs.cpSync(source, target, { recursive: true, verbatimSymlinks: true, preserveTimestamps: true });
export const sha256 = file => () => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export const execute = capture => dir => command => argv => () => {
  const result = spawnSync(command, argv, { cwd: dir, stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit', encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  return { code: result.status ?? 1, output: result.stdout ?? '' };
};
