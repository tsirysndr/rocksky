// prepublishOnly: the npm version must match playerd/Cargo.toml, because the
// package downloads the GitHub release tagged playerd-v<npm version> — a
// mismatch publishes a package that fetches the wrong (or a missing) binary.
// Skips silently when Cargo.toml isn't present (publishing from a bare
// tarball outside the repo).

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const cargoPath = path.join(__dirname, "..", "Cargo.toml");
if (!fs.existsSync(cargoPath)) process.exit(0);

const cargo = fs.readFileSync(cargoPath, "utf8");
const m = cargo.match(/^version *= *"([^"]+)"/m);
const cargoVersion = m && m[1];
const npmVersion = require("./package.json").version;

if (cargoVersion !== npmVersion) {
  console.error(
    `version mismatch: playerd/Cargo.toml is ${cargoVersion} but npm package is ${npmVersion} — ` +
      "they must match, since the package downloads the playerd-v<npm version> release",
  );
  process.exit(1);
}
