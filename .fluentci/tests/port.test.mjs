import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { installHost } from "./pdk-host.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = new URL("../main/output/", import.meta.url);
const load = name => import(new URL(`${name}/index.js`, output));

// The SDK needs an Extism host only at an effect boundary.
installHost();

test("every Dagger module function has a declared FluentCI Wasm export", () => {
  const config = readFileSync(resolve(root, "fluentci.toml"), "utf8");
  for (const module of readdirSync(resolve(root, ".dagger"), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)) {
    if (["host", "sdk"].includes(module) || !existsSync(resolve(root, ".dagger", module, "src/Main.purs"))) continue;
    const source = readFileSync(resolve(root, ".dagger", module, "src/Main.purs"), "utf8");
    const expected = [...source.matchAll(/(?:Module|M)\.function "([^"]+)"/g)].map(m => m[1]);
    assert.match(config, new RegExp(`name = "${module}"\\npath = "\\.fluentci/${module}"\\nsdk = "purescript"`));
    const entry = readFileSync(resolve(root, ".fluentci", module, "entry.mjs"), "utf8");
    const abi = readFileSync(resolve(root, ".fluentci", module, "imports.d.ts"), "utf8");
    for (const job of expected) {
      assert.match(entry, new RegExp(`\\b${job}\\b`));
      assert.ok(abi.includes(`export function ${job}(): I32;`), `${module}.${job}`);
    }
  }
});

test("default pipeline runs checks and the main placeholder is gone", () => {
  const source = readFileSync(resolve(root, ".fluentci/main/src/Main.purs"), "utf8");
  assert.doesNotMatch(source, /Hello from FluentCI|hello/);
  const config = readFileSync(resolve(root, "fluentci.toml"), "utf8");
  assert.match(config, /command = "fluentci run main checks"/);
  assert.doesNotMatch([...config.matchAll(/^command = (.*)$/gm)].map(m => m[1]).join("\n"), /deploy|publishPostgres|uploadRelease/);
});

test("deployment validation, ordering, failure handling, and rollback", async () => {
  const deploy = await load("Rocksky.CI.Test.Deploy");
  deploy.main();
});

test("host tag precedence, native archives, and portable checksum names", async () => {
  const host = await load("Rocksky.CI.Test.Host");
  host.main();
});
