import { build } from "esbuild";
import { chmod, cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
const common = {
  absWorkingDir: root,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  tsconfig: "tsconfig.json",
};
await build({
  ...common,
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  target: "node22",
});
await build({
  ...common,
  entryPoints: ["src/tui/launch.tsx"],
  outfile: "dist/tui.mjs",
  target: "esnext",
});
await chmod(new URL("../dist/index.js", import.meta.url), 0o755);
await cp(
  new URL("../drizzle/", import.meta.url),
  new URL("../dist/drizzle/", import.meta.url),
  { recursive: true },
);
