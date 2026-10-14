import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import chalk from "chalk";
import { renderProgress } from "../cmd/import";

test("progress keeps a colored failure counter and separate skipped count within 80 columns", () => {
  const originalWrite = process.stdout.write;
  const columns = Object.getOwnPropertyDescriptor(process.stdout, "columns");
  const level = chalk.level;
  let output = "";
  try {
    chalk.level = 3;
    Object.defineProperty(process.stdout, "columns", { configurable: true, value: 80 });
    process.stdout.write = ((chunk: string) => { output += chunk; return true; }) as typeof process.stdout.write;
    renderProgress(16, 417, 8, Date.now() - 60000, {
      title: "A very long track title that must not cause the progress line to wrap", artist: "Artist",
      timestamp: 1500000000, source: "spotify",
    }, 4);
    const plain = stripVTControlCharacters(output).replace(/\r/g, "");
    expect(plain).toContain("✖8 failed");
    expect(plain).toContain("↷4 skipped");
    expect(plain.length).toBeLessThan(80);
    expect(output).toContain("\x1b[38;2;255;100;100m");
    output = "";
    renderProgress(0, 417, 0, Date.now());
    expect(stripVTControlCharacters(output)).not.toContain("failed");
    expect(stripVTControlCharacters(output)).not.toContain("✖");
  } finally {
    process.stdout.write = originalWrite;
    chalk.level = level;
    if (columns) Object.defineProperty(process.stdout, "columns", columns);
    else delete (process.stdout as any).columns;
  }
});
