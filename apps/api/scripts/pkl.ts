import chalk from "chalk";
import { mkdirSync, readdirSync, statSync } from "fs";
import { dirname } from "path";
import { join } from "path";
import { $ } from "zx";
import { consola } from "consola";

function getPklFilesRecursive(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...getPklFilesRecursive(fullPath));
      continue;
    }

    if (entry.endsWith(".pkl")) {
      files.push(fullPath);
    }
  }

  return files;
}

const files = await getPklFilesRecursive(join("pkl", "defs"));

await Promise.all(
  files.map(async (fullPath) => {
    consola.info(`pkl eval ${chalk.cyan(fullPath)}`);
    const out = fullPath
      .replace(/\.pkl$/, ".json")
      .replace(/pkl[\\\/]defs/g, "lexicons");
    mkdirSync(dirname(out), { recursive: true });
    await $`pkl eval -f json ${fullPath} > ${out}`;
  }),
);
