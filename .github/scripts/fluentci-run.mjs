import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

export function expandArguments(input, environment) {
  if (!input || Array.isArray(input) || typeof input !== "object") throw Error("FluentCI arguments must be a JSON object");
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key,
    typeof value === "string" ? value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}|\$([A-Z_][A-Z0-9_]*)/g, (_, a, b) => {
      const name = a || b;
      if (!(name in environment)) throw Error(`Missing argument environment variable: ${name}`);
      return environment[name];
    }) : value,
  ]));
}

export function invocation(environment) {
  const { FLUENTCI_MODULE: module, FLUENTCI_FUNCTION: fn } = environment;
  if (!/^[a-z][a-z0-9-]*$/.test(module || "") || !/^[a-z][a-zA-Z0-9]*$/.test(fn || "")) throw Error("Invalid FluentCI module or function");
  const args = expandArguments(JSON.parse(environment.FLUENTCI_ARGUMENTS || "{}"), environment);
  return ["run", "--check-update", "false", "--wasm", `.fluentci/${module}/dist/plugin.wasm`, fn, JSON.stringify(args)];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = invocation(process.env);
  if (!existsSync(args[4])) throw Error(`Missing compiled module ${args[4]}; run the fluentci-modules preparation job first`);
  const result = spawnSync("fluentci", args, { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
