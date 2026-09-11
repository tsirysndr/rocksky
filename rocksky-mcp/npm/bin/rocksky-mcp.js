#!/usr/bin/env node
// Thin launcher for the native rocksky-mcp binary. Normally postinstall has
// already fetched it; when install scripts were skipped (--ignore-scripts,
// some CI setups) it is fetched here on first run instead, so the command
// works either way.

"use strict";

const { spawn } = require("node:child_process");
const { ensureBinary } = require("../lib/download");

async function main() {
  const bin = await ensureBinary();
  const child = spawn(bin, process.argv.slice(2), { stdio: "inherit" });
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(sig, () => child.kill(sig));
  }
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exitCode = code ?? 1;
    }
  });
}

main().catch((err) => {
  console.error(`rocksky-mcp: ${err.message}`);
  process.exitCode = 1;
});
