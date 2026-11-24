import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

for (const variant of ["typescript", "purescript"]) {
  test(`${variant} logs use ANSI colors consistently in Node and Bun`, async () => {
    const temp = mkdtempSync(join(tmpdir(), "rocksky-log-colors-"));
    try {
      const logger = resolve(
        import.meta.dir,
        variant === "typescript"
          ? "../src/logger.ts"
          : "../../../purescript/cli/runtime/logger.js",
      );
      const entry = join(temp, "probe.ts");
      writeFileSync(
        entry,
        `import {logger} from ${JSON.stringify(logger)}; logger.info\`Matched track \${"One More Time"} by \${"Daft Punk"}\`;`,
      );
      const build = await Bun.build({
        entrypoints: [entry],
        outdir: temp,
        target: "node",
      });
      expect(build.success).toBe(true);
      for (const runtime of ["node", process.execPath]) {
        for (const mode of ["forced", "disabled", "pipe"]) {
          const env = { ...process.env };
          delete env.FORCE_COLOR;
          delete env.NO_COLOR;
          if (mode === "forced") env.FORCE_COLOR = "3";
          if (mode === "disabled") env.NO_COLOR = "1";
          const result = Bun.spawnSync([runtime, join(temp, "probe.js")], {
            env,
          });
          const output = result.stdout.toString() + result.stderr.toString();
          expect(result.exitCode).toBe(0);
          expect(output).toContain("One More Time");
          expect(/\x1b\[[\d;]+m/.test(output)).toBe(mode === "forced");
        }
      }
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
}
