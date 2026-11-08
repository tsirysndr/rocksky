import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { expandArguments, invocation } from "../../.github/scripts/fluentci-run.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = path => readFileSync(resolve(root, path), "utf8");
const workflows = readdirSync(resolve(root, ".github/workflows")).filter(name => name.endsWith(".yml"));

test("all workflows use the shared FluentCI compilation job and retire Dagger", () => {
  for (const name of workflows) {
    const source = read(`.github/workflows/${name}`);
    assert.doesNotMatch(source, /dagger|DAGGER/i, name);
    if (name !== "fluentci-modules.yml") assert.match(source, /uses: \.\/\.github\/workflows\/fluentci-modules\.yml/, name);
    assert.doesNotMatch(source, /run: (?:cargo|bun|nix build|node \.dagger)/, name);
  }
});

test("workflow invocations resolve to exported module functions with valid JSON arguments", () => {
  for (const name of workflows) {
    const source = read(`.github/workflows/${name}`);
    for (const match of source.matchAll(/module: ([\w-]+)\n\s+function: (\w+)\n\s+arguments: '([^\n]*)'/g)) {
      const [, module, fn, args] = match;
      assert.match(read(`.fluentci/${module}/entry.mjs`), new RegExp(`\\b${fn}\\b`), `${name}: ${module}.${fn}`);
      assert.equal(typeof JSON.parse(args), "object", `${name}: ${module}.${fn}`);
    }
  }
});

test("the official setup action runs before SDK setup and WSL preserves Windows builds", () => {
  const setup = read(".github/actions/setup-fluentci/action.yml");
  assert.match(setup, /uses: fluentci-io\/setup-fluentci@next/);
  assert.ok(setup.indexOf("uses: fluentci-io/setup-fluentci@next") < setup.indexOf("uses: actions/setup-node"));
  assert.doesNotMatch(setup, /version: '\d{4}\.\d{2}\.\d{2}'/);
  assert.doesNotMatch(setup, /FLUENTCI_VERSION=/);
  assert.match(read(".github/scripts/install-fluentci.sh"), /releases\/latest/);
  assert.doesNotMatch(read(".github/scripts/install-fluentci.sh"), /FLUENTCI_VERSION:-\d/);
  assert.match(read(".github/scripts/install-fluentci.sh"), /curl --fail --show-error --location --retry 3/);
  assert.match(read(".github/scripts/install-fluentci.sh"), /SHA-256 checksum mismatch/);
  assert.match(setup, /Vampire\/setup-wsl@v7/);
  assert.match(read(".github/workflows/rocksky-mcp-release.yml"), /x86_64-pc-windows-msvc\n\s+os: windows-latest/);
  assert.match(read(".github/actions/fluentci/action.yml"), /ROCKSKY_NODE=.*node\.exe/);
  assert.match(read(".github/actions/fluentci/action.yml"), /ROCKSKY_WINDOWS_PATH/);
});

test("argument expansion preserves quotes, newlines, and shell syntax as literal data", () => {
  const value = `a quote ' and \"; $(touch forbidden)\nline2`;
  const args = expandArguments({ tag: "$TAG", output: "${RUNNER_TEMP}/assets", clobber: true }, { TAG: value, RUNNER_TEMP: "/tmp/with spaces" });
  assert.deepEqual(args, { tag: value, output: "/tmp/with spaces/assets", clobber: true });
  assert.throws(() => expandArguments({ tag: "$MISSING" }, {}), /Missing argument environment variable/);
  const argv = invocation({ FLUENTCI_MODULE: "github-release", FLUENTCI_FUNCTION: "upload", FLUENTCI_ARGUMENTS: '{"tag":"$TAG"}', TAG: value });
  assert.equal(argv[4], ".fluentci/github-release/dist/plugin.wasm");
  assert.deepEqual(JSON.parse(argv.at(-1)), { tag: value });
  assert.throws(() => invocation({ FLUENTCI_MODULE: "../escape", FLUENTCI_FUNCTION: "upload" }), /Invalid FluentCI/);
});

test("publishing stays disabled for PostgreSQL and production deploy keeps its gate", () => {
  assert.match(read(".github/workflows/docker-build-and-push-postgres.yml"), /if: \$\{\{ false \}\}/);
  const production = read(".github/workflows/build.yml");
  assert.match(production, /github.ref == 'refs\/heads\/main'/);
  assert.match(production, /needs.changes.result == 'success'/);
  assert.match(production, /cancel-in-progress: false/);
});
